import { Injectable, Logger } from '@nestjs/common';
import { BuscarVendedoraPorWhatsappUseCase } from '../../../vendedoras/application/use-cases/buscar-vendedora-por-whatsapp.use-case';
import { ProcessarRelatoVendedoraUseCase } from './processar-relato-vendedora.use-case';

export interface MensagemInterna {
  /** Chat de origem (`5585...@c.us`). */
  de: string;
  texto: string;
}

export interface RespostaInterna {
  /** Texto a devolver, ou null quando a mensagem deve ser ignorada em silencio. */
  resposta: string | null;
  /** Rotulo do que aconteceu, para o log. Nunca contem PII. */
  motivo:
    | 'ignorado_remetente_desconhecido'
    | 'sem_pendencia'
    | 'nao_entendi'
    | 'relato_registrado';
}

/**
 * Porta de entrada do canal INTERNO de WhatsApp (ADM e vendedoras).
 *
 * DEFAULT-DENY POR REMETENTE, e essa e a primeira coisa que acontece: telefone
 * que nao pertence a uma vendedora ativa nao recebe resposta e NAO chega ao
 * LLM. Nao e "numero secreto e torcer" — e verificacao no banco, pelo HMAC do
 * telefone, antes de qualquer processamento.
 *
 * Silencio, e nao uma mensagem de erro, e deliberado: responder "voce nao esta
 * cadastrado" confirmaria a quem sondasse que existe um canal aqui.
 *
 * O ADM ainda nao entra: `admin_users` nao tem coluna de telefone. Quando
 * tiver, este e o ponto onde o segundo ramo entra.
 */
@Injectable()
export class ProcessarMensagemInternaUseCase {
  private readonly logger = new Logger(ProcessarMensagemInternaUseCase.name);

  constructor(
    private readonly identificarVendedora: BuscarVendedoraPorWhatsappUseCase,
    private readonly relato: ProcessarRelatoVendedoraUseCase,
  ) {}

  async execute(msg: MensagemInterna): Promise<RespostaInterna> {
    const telefone = msg.de.replace(/@.*$/, '');
    const vendedora = await this.identificarVendedora.execute(telefone);

    if (!vendedora?.id) {
      // Nao logamos o numero: e PII, e o log e o lugar mais facil de vazar.
      this.logger.debug('Mensagem interna de remetente nao reconhecido — ignorada.');
      return { resposta: null, motivo: 'ignorado_remetente_desconhecido' };
    }

    const r = await this.relato.execute(vendedora.id, msg.texto);

    if (r.status === 'SEM_PENDENCIA') {
      // Ela escreveu sem que houvesse cobranca aberta. Nao inventamos conversa:
      // o canal existe para o acompanhamento, e quem inicia e o sistema.
      return {
        resposta:
          'Oi! No momento não tenho nenhum acompanhamento aberto com você. Quando eu te encaminhar um cliente, é só me contar por aqui como foi.',
        motivo: 'sem_pendencia',
      };
    }

    if (r.status === 'NAO_ENTENDI') {
      return {
        resposta:
          'Desculpa, não consegui entender. Você chegou a falar com o cliente? Se ficou de retornar, me diz o horário.',
        motivo: 'nao_entendi',
      };
    }

    return { resposta: r.resposta, motivo: 'relato_registrado' };
  }
}
