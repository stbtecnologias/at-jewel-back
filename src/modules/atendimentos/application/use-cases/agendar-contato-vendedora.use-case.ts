import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';

/** Minutos antes do combinado em que sai o lembrete. */
const MINUTOS_LEMBRETE = 15;
/** Minutos depois em que a cobranca volta a perguntar como foi. */
const MINUTOS_COBRANCA = 60;
/** Teto de quanto no futuro um agendamento pode estar. */
const DIAS_MAXIMOS = 180;
/** Quantos homonimos a busca traz antes de desistir e perguntar. */
const MAXIMO_HOMONIMOS = 5;

export type ResultadoAgendamento =
  | { status: 'AGENDADO'; cliente: string; quando: Date }
  | { status: 'CLIENTE_NAO_ENCONTRADO' }
  | { status: 'CLIENTE_AMBIGUO'; nomes: string[] }
  | { status: 'HORARIO_INVALIDO' }
  | { status: 'ATENDIMENTO_DE_OUTRA_PESSOA'; cliente: string };

/**
 * A vendedora coloca um contato na PROPRIA agenda.
 *
 * E a mesma maquina do `avisar_vendedora` — atendimento, lembrete e cobranca —,
 * so muda quem puxa o gatilho: la e o ADM, aqui e ela.
 *
 * TRES TRAVAS, e todas antes de qualquer escrita:
 *
 * 1. CARTEIRA. O cliente e procurado apenas dentro da carteira dela
 *    (`clientes.vendedora_codigo_erp`). Cliente de fora nao e recusado — ele
 *    nao existe para a consulta. A distincao importa porque a RECUSA vaza:
 *    responder "esse cliente e de outra vendedora" ja conta que ele existe e
 *    que tem dona. Aqui a resposta e identica a de nome errado.
 *
 * 2. AMBIGUIDADE. Dois clientes dela com o mesmo nome param o fluxo e devolvem
 *    a lista para ela escolher. Nunca escolhemos por conta propria — agendar no
 *    cliente errado e pior do que perguntar.
 *
 * 3. ATENDIMENTO CONGELADO. Se ja existe episodio aberto e a vendedora dele nao
 *    e ela, nao mexemos. Acontece quando a carteira foi remanejada: o cliente e
 *    dela hoje, mas o atendimento em curso e de quem atendia antes. Reescrever
 *    ali apagaria historico de outra pessoa.
 */
@Injectable()
export class AgendarContatoVendedoraUseCase {
  private readonly logger = new Logger(AgendarContatoVendedoraUseCase.name);

  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
  ) {}

  async execute(
    vendedoraId: string,
    vendedoraCodigoErp: string | null,
    nomeCliente: string,
    quandoIso: string,
  ): Promise<ResultadoAgendamento> {
    const quando = interpretarHorario(quandoIso);
    if (!quando) return { status: 'HORARIO_INVALIDO' };

    // Sem codigo do ERP nao ha carteira. Mesma resposta de nome errado: nao
    // damos pista sobre o motivo.
    if (!vendedoraCodigoErp) return { status: 'CLIENTE_NAO_ENCONTRADO' };

    const achados = await this.clientes.buscarNaCarteiraPorNome(
      vendedoraCodigoErp,
      nomeCliente.trim(),
      MAXIMO_HOMONIMOS,
    );

    if (achados.length === 0) return { status: 'CLIENTE_NAO_ENCONTRADO' };
    if (achados.length > 1) {
      return { status: 'CLIENTE_AMBIGUO', nomes: achados.map((c) => c.nome) };
    }

    const cliente = achados[0];
    if (!cliente.id) return { status: 'CLIENTE_NAO_ENCONTRADO' };

    const emCurso = await this.atendimentos.buscarAbertoPorCliente(cliente.id);
    if (emCurso && emCurso.vendedoraId !== vendedoraId) {
      return { status: 'ATENDIMENTO_DE_OUTRA_PESSOA', cliente: cliente.nome };
    }

    const atendimento =
      emCurso ??
      (await this.atendimentos.abrir({ clienteId: cliente.id, vendedoraId }));

    // `reagendar` MOVE a pendencia existente em vez de criar outra: marcar duas
    // vezes o mesmo cliente corrige o horario, nao gera dois lembretes.
    const lembrete = new Date(quando.getTime() - MINUTOS_LEMBRETE * 60_000);
    if (lembrete.getTime() > Date.now()) {
      await this.atendimentos.reagendar(atendimento.id, 'LEMBRETE', lembrete, quando);
    }
    const cobranca = new Date(quando.getTime() + MINUTOS_COBRANCA * 60_000);
    await this.atendimentos.reagendar(atendimento.id, 'COBRANCA', cobranca, quando);

    // Quem marcou fica na linha do tempo. Contato agendado pelo ADM e contato
    // que a propria vendedora marcou contam historias diferentes, e daqui a um
    // mes ninguem lembra qual foi qual.
    await this.atendimentos.criarInteracao({
      atendimentoId: atendimento.id,
      tipo: 'NOTA',
      ocorridoEm: new Date(),
      status: 'CONCLUIDA',
      relato: `Contato agendado pela própria vendedora para ${quando.toLocaleString('pt-BR')}.`,
    });

    this.logger.log(`Contato agendado pela vendedora no atendimento ${atendimento.id}.`);
    return { status: 'AGENDADO', cliente: cliente.nome, quando };
  }
}

/**
 * Aceita apenas horario FUTURO e dentro de seis meses. Data no passado quase
 * sempre e o modelo errando o ano; data muito distante, alucinacao.
 */
function interpretarHorario(iso: string): Date | null {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return null;
  const agora = Date.now();
  if (quando.getTime() < agora) return null;
  if (quando.getTime() > agora + DIAS_MAXIMOS * 24 * 60 * 60_000) return null;
  return quando;
}
