import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RotearMensagemInternaUseCase } from '../../../../atendimentos/application/use-cases/rotear-mensagem-interna.use-case';
import { WHATSAPP_GATEWAY } from '../../../domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../domain/ports/whatsapp-gateway.port';
import { extrairMensagemRecebida } from '../waha-webhook';
import { WahaAuthGuard } from '../guards/waha-auth.guard';
import { TriagemClient } from '../../whatsapp/triagem.client';

/**
 * Webhook que o WAHA chama a cada evento de WhatsApp. Rota PUBLICA (sem JWT),
 * protegida pelo WahaAuthGuard (token compartilhado no header X-Webhook-Token).
 *
 * Body tipado como `unknown` de proposito: o payload do WAHA tem muitos campos
 * e o ValidationPipe global (whitelist + forbidNonWhitelisted) rejeitaria um
 * DTO estrito. O parsing e feito de forma defensiva em `extrairMensagemRecebida`.
 */
@Controller('whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly triagem: TriagemClient,
    private readonly processar: RotearMensagemInternaUseCase,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
  ) {}

  @Post('webhook')
  @UseGuards(WahaAuthGuard)
  @HttpCode(200)
  async webhook(@Body() body: unknown) {
    const msg = extrairMensagemRecebida(body);
    // Evento ignorado (status, ack, mensagem nossa, grupo, etc.): apenas ack.
    if (!msg) return { ok: true, ignorado: true };

    // O `from` do WAHA pode ser um LID, e nao um telefone. A traducao e
    // assunto de TRANSPORTE — acontece aqui, na borda, e o use case recebe
    // sempre um identificador com telefone dentro. Ver `resolverRemetente`.
    const de = await this.whatsapp.resolverRemetente(msg.de);

    try {
      // O audio, quando ha, segue DESCRITO e nao baixado: so a referencia do
      // arquivo viaja daqui. Quem baixa e transcreve e o ROTEADOR, depois de
      // reconhecer quem escreveu — transcrever custa dinheiro, e aqui na borda
      // ainda nao se sabe se o remetente merece um centavo.
      //
      // O roteador tambem decide QUAL agente responde: Elena para a vendedora,
      // Anastasia para a gestao, silencio para o resto.
      const resultado = await this.processar.execute({ ...msg, de });

      // QUEM NAO E DA CASA E CLIENTE — e cliente tem dono: a triagem.
      //
      // Este era o ramo do silencio, e era ele que obrigava a escolher entre
      // atender a equipe OU atender o cliente, porque os dois publicos chegam
      // pelo MESMO numero. O default-deny continua valendo para o canal
      // interno: nada aqui responde em nome da Elena ou da Anastasia da
      // gestao. O que muda e que a mensagem deixa de morrer — ela segue para o
      // servico que sabe atender quem esta chegando agora.
      //
      // SEM `await`: o `atwpp` chama o LLM antes de devolver o HTTP, e segurar
      // o webhook por esse tempo faria o WAHA reenviar o evento. A cliente
      // receberia a mesma pergunta duas vezes.
      if (resultado.motivo === 'ignorado_remetente_desconhecido') {
        if (this.triagem.disponivel()) {
          void this.triagem.encaminhar(body);
          return { ok: true, encaminhado: 'triagem' };
        }
        return { ok: true, ignorado: true, motivo: resultado.motivo };
      }

      // Reconhecido, mas sem o que responder (audio vazio, mensagem em branco).
      if (!resultado.resposta) {
        return { ok: true, ignorado: true, motivo: resultado.motivo };
      }
      // Responde para o chat resolvido, nunca para o LID.
      await this.whatsapp.enviarTexto(de, resultado.resposta);
      // Fora de producao, devolve a resposta gerada para facilitar debug do
      // webhook (atras do token; e a mensagem da propria agente, nao PII).
      const debug =
        this.config.get<string>('NODE_ENV') !== 'production'
          ? { resposta: resultado.resposta }
          : {};
      return { ok: true, enviada: true, motivo: resultado.motivo, ...debug };
    } catch (err) {
      // Mesmo em erro, retornamos 200 para o WAHA nao entrar em retry-storm;
      // o erro fica registrado para diagnostico.
      this.logger.error(`Falha ao processar mensagem do WhatsApp: ${String(err)}`);
      return { ok: true, erro: true };
    }
  }
}
