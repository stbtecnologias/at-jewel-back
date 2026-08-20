import { Inject, Injectable } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';

export type PeriodoAgenda = 'HOJE' | 'AMANHA' | 'SEMANA';

export interface CompromissoDaVendedora {
  /** Nome do cliente. E dela, entao ela pode ver. */
  cliente: string;
  /** Quando ela combinou de falar com ele. */
  quando: Date;
  ocasiao: string | null;
}

/**
 * A agenda da vendedora: com quem ela combinou de falar, e quando.
 *
 * ESCOPO NO `WHERE`, NAO NO FILTRO. A consulta recebe o `vendedoraId` que veio
 * do telefone resolvido na entrada do canal e pergunta ao banco apenas pelos
 * atendimentos dela. Compromisso de outra vendedora nao e recusado depois — ele
 * nao chega a existir para esta consulta, e por isso nenhuma frase alcanca.
 *
 * Le `combinado_em`, o horario com o CLIENTE — nao `notificar_em`, que e a hora
 * em que o sistema manda a mensagem. A agenda dela e feita dos compromissos
 * dela, nao dos nossos lembretes.
 */
@Injectable()
export class ConsultarAgendaVendedoraUseCase {
  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
  ) {}

  async execute(
    vendedoraId: string,
    periodo: PeriodoAgenda,
    agora: Date = new Date(),
  ): Promise<CompromissoDaVendedora[]> {
    const { de, ate } = janela(periodo, agora);
    const compromissos = await this.atendimentos.listarAgenda(vendedoraId, de, ate);
    if (compromissos.length === 0) return [];

    // Nomes em lote seriam melhores, mas a agenda de um dia e curta e o
    // repositorio ainda nao tem busca por lista de ids. Fica assim ate doer.
    const resultado: CompromissoDaVendedora[] = [];
    for (const c of compromissos) {
      const cliente = await this.clientes.buscarPorId(c.clienteId);
      resultado.push({
        cliente: cliente?.nome ?? 'cliente sem nome no cadastro',
        quando: c.combinadoEm,
        ocasiao: c.ocasiao,
      });
    }
    return resultado;
  }
}

/**
 * A janela de cada periodo, no fuso do servidor (TZ=America/Sao_Paulo).
 *
 * HOJE comeca AGORA, e nao a meia-noite: perguntar "como esta minha agenda
 * hoje" as tres da tarde e perguntar o que ainda vem, nao o que ja passou.
 * SEMANA sao os proximos sete dias corridos, e nao "esta semana ate domingo",
 * porque na sexta-feira o util e o que vem pela frente.
 */
function janela(periodo: PeriodoAgenda, agora: Date): { de: Date; ate: Date } {
  const fimDoDia = (d: Date) => {
    const f = new Date(d);
    f.setHours(23, 59, 59, 999);
    return f;
  };

  if (periodo === 'HOJE') {
    return { de: agora, ate: fimDoDia(agora) };
  }

  if (periodo === 'AMANHA') {
    const amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);
    return { de: amanha, ate: fimDoDia(amanha) };
  }

  const seteDias = new Date(agora);
  seteDias.setDate(seteDias.getDate() + 7);
  return { de: agora, ate: fimDoDia(seteDias) };
}
