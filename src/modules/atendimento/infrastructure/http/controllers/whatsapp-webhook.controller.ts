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
      // Remetente nao reconhecido: nem resposta, nem envio. Ver o default-deny
      // em ProcessarMensagemInternaUseCase.
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
