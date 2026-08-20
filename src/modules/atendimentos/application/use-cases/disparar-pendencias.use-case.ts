import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IAtendimentoRepository,
  Interacao,
} from '../../domain/ports/repositories/atendimento-repository.port';

/** Quantas pendencias por rodada. Teto defensivo contra fila represada. */
const LOTE = 50;

/**
 * Atraso maximo tolerado. Mais velho que isto expira sem enviar: cobrar as 3
 * da manha um contato de ontem a tarde nao ajuda ninguem, e a vendedora
 * acordaria com uma fila de mensagens fora de contexto — o cenario tipico
 * depois de o servidor passar a noite fora.
 */
const HORAS_MAXIMAS_ATRASO = 6;


/**
 * Dispara o que venceu na agenda: o lembrete antes do horario combinado e a
 * cobranca depois.
 *
 * SEM REGRA DE HORARIO COMERCIAL (decisao do Lucas, 19/08/2026): o combinado
 * com o cliente vale como foi dito, inclusive domingo as 21h.
 *
 * IDEMPOTENCIA: o status da interacao e o que impede reenvio. Enquanto o envio
 * nao confirma, ela segue PENDENTE e volta na proxima rodada — repetir uma
 * mensagem e menos grave do que marcar como enviada uma que nunca saiu.
 */
@Injectable()
export class DispararPendenciasUseCase {
  private readonly logger = new Logger(DispararPendenciasUseCase.name);

  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
  ) {}

  async execute(agora = new Date()): Promise<{ enviadas: number; expiradas: number }> {
    const vencidas = await this.atendimentos.listarVencidas(agora, LOTE);
    if (vencidas.length === 0) return { enviadas: 0, expiradas: 0 };

    let enviadas = 0;
    let expiradas = 0;

    for (const pendencia of vencidas) {
      try {
        const resultado = await this.disparar(pendencia, agora);
        if (resultado === 'ENVIADA') enviadas += 1;
        if (resultado === 'EXPIRADA') expiradas += 1;
      } catch (err) {
        // Uma pendencia problematica nao pode travar a fila inteira. Ela fica
        // PENDENTE e volta na proxima rodada.
        this.logger.error(
          `Falha ao disparar a interacao ${pendencia.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (enviadas > 0 || expiradas > 0) {
      this.logger.log(`Agenda: ${enviadas} enviada(s), ${expiradas} expirada(s).`);
    }
    return { enviadas, expiradas };
  }

  private async disparar(
    pendencia: Interacao,
    agora: Date,
  ): Promise<'ENVIADA' | 'EXPIRADA' | 'ADIADA'> {
    const agendado = pendencia.notificarEm;
    if (!agendado) return 'ADIADA';

    const atrasoHoras = (agora.getTime() - agendado.getTime()) / 3_600_000;
    if (atrasoHoras > HORAS_MAXIMAS_ATRASO) {
      await this.atendimentos.atualizarStatusInteracao(pendencia.id, 'EXPIRADA');
      this.logger.warn(
        `Interacao ${pendencia.id} expirou: ${atrasoHoras.toFixed(1)}h de atraso.`,
      );
      return 'EXPIRADA';
    }

    const atendimento = await this.atendimentos.buscarPorId(pendencia.atendimentoId);
    if (!atendimento) return 'ADIADA';

    // Atendimento ja fechado nao gera cobranca: o episodio acabou.
    if (atendimento.fechadoEm) {
      await this.atendimentos.atualizarStatusInteracao(pendencia.id, 'EXPIRADA');
      return 'EXPIRADA';
    }

    const [cliente, vendedora] = await Promise.all([
      this.clientes.buscarPorId(atendimento.clienteId),
      this.vendedoras.buscarPorId(atendimento.vendedoraId),
    ]);
    if (!cliente || !vendedora?.whatsappInterno) {
      this.logger.warn(
        `Interacao ${pendencia.id} sem destinatario (cliente ou WhatsApp da vendedora ausente).`,
      );
      return 'ADIADA';
    }

    const chatId = await this.whatsapp.resolverChatId(vendedora.whatsappInterno);
    if (!chatId) {
      this.logger.warn(
        `Interacao ${pendencia.id}: o numero da vendedora ${vendedora.id} nao tem WhatsApp.`,
      );
      return 'ADIADA';
    }

    await this.whatsapp.enviarTexto(
      chatId,
      montarTexto(pendencia, vendedora.nome, cliente.nome),
    );

    // A cobranca fica esperando o relato — e por este status que a resposta da
    // vendedora sera reconhecida. O lembrete nao espera resposta.
    await this.atendimentos.atualizarStatusInteracao(
      pendencia.id,
      pendencia.tipo === 'COBRANCA' ? 'AGUARDANDO_RESPOSTA' : 'ENVIADA',
      agora,
    );
    return 'ENVIADA';
  }
}

/** Texto fixo, sem LLM: e aviso, nao conversa. */
function montarTexto(
  pendencia: Interacao,
  vendedoraNome: string,
  clienteNome: string,
): string {
  const primeiroNome = vendedoraNome.trim().split(/\s+/)[0];

  if (pendencia.tipo === 'LEMBRETE') {
    // Le o combinado da propria interacao. Antes eu recalculava somando a
    // antecedencia de volta ao notificar_em — funcionava por coincidencia, e
    // passaria a mentir no dia em que a antecedencia mudasse.
    if (!pendencia.combinadoEm) {
      return `${primeiroNome}, daqui a pouco é o contato com ${clienteNome}.`;
    }
    const hora = pendencia.combinadoEm.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${primeiroNome}, daqui a pouco é o contato com ${clienteNome} — combinado para as ${hora}.`;
  }

  // Cobranca SEM horario combinado e retomada: ela ja disse que nao
  // conseguiu falar, entao "como foi" nao faz sentido — nao houve nada ainda.
  if (!pendencia.combinadoEm) {
    return `${primeiroNome}, conseguiu falar com ${clienteNome} depois?`;
  }

  return `${primeiroNome}, como foi com ${clienteNome}?`;
}
