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
import { contatoDoEvento, extrairMensagemRecebida, sessaoDoEvento } from '../waha-webhook';
import { WahaAuthGuard } from '../guards/waha-auth.guard';
import { TriagemClient } from '../../whatsapp/triagem.client';
import { ConexoesService } from '../../../application/conexoes.service';
import { RegistrarContatoWhatsappUseCase } from '../../../../atendimentos/application/use-cases/registrar-contato-whatsapp.use-case';

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
    private readonly conexoes: ConexoesService,
    private readonly registrarContato: RegistrarContatoWhatsappUseCase,
    private readonly processar: RotearMensagemInternaUseCase,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
  ) {}

  @Post('webhook')
  @UseGuards(WahaAuthGuard)
  @HttpCode(200)
  async webhook(@Body() body: unknown) {
    // ======================================================================
    // A PRIMEIRA PERGUNTA E "DE QUEM E ESTE NUMERO?", E ELA VEM ANTES DE TUDO.
    //
    // So a sessao da LOJA fala com a IA. A mensagem que passa pelo numero de
    // uma vendedora e REGISTRADA e nunca respondida: do outro lado esta uma
    // cliente conversando com a vendedora de verdade, e responder ali seria a
    // Anastasia falando por cima dela, numa conversa que nao e nossa.
    //
    // CAPTURAR NAO E RESPONDER, e o desvio abaixo e a linha que separa as
    // duas coisas: `registrarSemResponder` nao chama agente nenhum e nao
    // envia nada. A outra garantia esta no `WahaGateway`, que so sabe enviar
    // pelo `WAHA_SESSION` — nao existe caminho de codigo capaz de falar pelo
    // numero dela, nem por engano.
    //
    // Sem `session` no payload, o evento e tratado como da loja: e o formato
    // antigo, de quando havia uma sessao so, e recusar quebraria o canal
    // inteiro por causa de uma versao de payload.
    // ======================================================================
    const sessao = sessaoDoEvento(body);
    if (sessao !== null && sessao !== this.conexoes.sessaoDaLoja) {
      return this.registrarSemResponder(sessao, body);
    }

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
  /**
   * A mensagem que passou pelo numero de uma vendedora: registra e cala.
   *
   * ======================================================================
   * NENHUM AGENTE E CHAMADO AQUI, E NENHUMA MENSAGEM SAI.
   *
   * Este metodo existe justamente para ser o caminho CURTO — dele nao se
   * alcanca o roteador, a triagem nem o `enviarTexto`. Quem for mexer aqui um
   * dia: acrescentar uma resposta neste ponto quebra a decisao de 08/09/2026,
   * que e a IA nao falar no lugar da vendedora com a cliente dela.
   * ======================================================================
   *
   * O CONTEUDO da mensagem nao e lido nem gravado. So o fato: quem falou,
   * quando, e em que atendimento — ver `RegistrarContatoWhatsappUseCase`.
   */
  private async registrarSemResponder(sessao: string, body: unknown) {
    const vendedoraId = this.conexoes.vendedoraDaSessao(sessao);
    if (!vendedoraId) {
      // Sessao que nao e da loja nem casa com `vend-<uuid>`. Nao deveria
      // existir; se existir, o silencio continua sendo a resposta certa.
      return { ok: true, ignorado: true, motivo: 'sessao_desconhecida' };
    }

    const contato = contatoDoEvento(body);
    if (!contato) {
      return { ok: true, ignorado: true, motivo: 'evento_sem_contato' };
    }

    try {
      const r = await this.registrarContato.execute({
        vendedoraId,
        telefone: contato.telefone,
        daVendedora: contato.daVendedora,
        em: contato.em,
      });
      return r.registrado
        ? { ok: true, registrado: true, motivo: r.tipo }
        : { ok: true, ignorado: true, motivo: r.motivo };
    } catch (err) {
      // 200 mesmo em erro, como no ramo da loja: o WAHA reenviaria o evento e
      // a rajada de retentativas seria pior que o ponto perdido.
      this.logger.error(`Falha ao registrar contato no WhatsApp: ${String(err)}`);
      return { ok: true, erro: true };
    }
  }

}
