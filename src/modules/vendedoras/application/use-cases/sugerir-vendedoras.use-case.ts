import { Inject, Injectable } from '@nestjs/common';
import {
  CLIENTE_REPOSITORY,
} from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { VENDA_REPOSITORY } from '../../../vendas/domain/ports/injection-tokens';
import type { IVendaRepository } from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { VendedoraMetricas } from '../../domain/entities/vendedora-metricas.entity';
import {
  VENDEDORA_METRICAS_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';
import { ListarVendedorasDisponiveisUseCase } from './listar-vendedoras-disponiveis.use-case';

/**
 * Pesos do score de sugestao de vendedora (S8 — roteamento da Anastasia).
 *
 * O score vive 100% no servidor: e testavel e NAO expoe metricas ao LLM
 * (o agente recebe apenas score + motivos curtos, nunca os agregados crus).
 *
 * TODOS OS PESOS SAO A CALIBRAR. Os valores iniciais sao um ponto de partida
 * conservador. A soma maxima teorica (BASE + todos os boosts) e limitada a 100.
 *
 *  - BASE: piso neutro. Garante que uma vendedora disponivel sem nenhum outro
 *    sinal positivo nao fique zerada (uma vendedora nova precisa poder ser
 *    sugerida).
 *  - RELACIONAMENTO: boost forte. Continuidade de atendimento e o sinal mais
 *    valioso (cliente ja conhece e confia na vendedora).
 *  - ESPECIALIDADE: boost medio. Match entre o tipo de joia/atendimento
 *    desejado e a especialidade declarada da vendedora.
 *  - DESEMPENHO_MAX: boost menor. Indicador combinado de qualidade
 *    (taxa de recompra + compatibilidade de ticket). Vendedora SEM metricas
 *    recebe a metade deste peso (neutro), nunca zero.
 */
export const PESOS_SUGESTAO = {
  // a calibrar
  BASE: 30,
  // a calibrar
  RELACIONAMENTO: 40,
  // a calibrar
  ESPECIALIDADE: 20,
  // a calibrar
  DESEMPENHO_MAX: 10,
} as const;

const SCORE_MAXIMO = 100;

// Janela relativa (fracao do ticket estimado) dentro da qual o ticket medio
// da vendedora e considerado "compativel" para fins de proximidade. A calibrar.
const JANELA_TICKET_RELATIVA = 1; // 100% do ticket estimado

export interface SugerirVendedorasInput {
  clienteId?: string | null;
  especialidade?: string | null;
  ticketEstimado?: number | null;
  limit?: number;
}

export interface VendedoraSugerida {
  codigoErp: string | null;
  nome: string;
  tipo: string;
  score: number;
  motivos: string[];
}

const LIMIT_PADRAO = 3;
const LIMIT_MAXIMO = 10;

@Injectable()
export class SugerirVendedorasUseCase {
  constructor(
    private readonly listarDisponiveis: ListarVendedorasDisponiveisUseCase,
    @Inject(VENDEDORA_METRICAS_REPOSITORY)
    private readonly metricasRepo: IVendedoraMetricasRepository,
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async execute(input: SugerirVendedorasInput): Promise<VendedoraSugerida[]> {
    const candidatas = await this.listarDisponiveis.execute();

    // Sem ninguem disponivel: lista vazia. O n8n trata como escalonamento
    // para NEEDS_HUMAN (decisao das proprietarias).
    if (candidatas.length === 0) {
      return [];
    }

    const limit = this.normalizarLimit(input.limit);
    const especialidade = this.normalizarEspecialidade(input.especialidade);
    const ticketEstimado =
      typeof input.ticketEstimado === 'number' && input.ticketEstimado > 0
        ? input.ticketEstimado
        : null;

    // Conjuntos para deteccao de relacionamento previo. Resolvidos uma vez
    // so (nao por candidata) para evitar N consultas.
    const { vendedoraIdsComVenda, codigoErpAtribuido } =
      await this.resolverRelacionamento(input.clienteId ?? null);

    // Metricas indexadas por vendedoraId (UUID). Le todas de uma vez (a
    // matview e pequena: uma linha por vendedora com venda concluida).
    const metricasPorVendedora = await this.indexarMetricas();

    const sugeridas = candidatas.map((c) =>
      this.pontuar(c, {
        vendedoraIdsComVenda,
        codigoErpAtribuido,
        especialidade,
        ticketEstimado,
        metricas: c.id ? metricasPorVendedora.get(c.id) ?? null : null,
      }),
    );

    // Ordena por score desc; desempate estavel por nome para resultado
    // deterministico (importante para os testes e para o operador humano).
    sugeridas.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nome.localeCompare(b.nome);
    });

    return sugeridas.slice(0, limit);
  }

  private pontuar(
    candidata: Vendedora,
    ctx: {
      vendedoraIdsComVenda: Set<string>;
      codigoErpAtribuido: string | null;
      especialidade: string | null;
      ticketEstimado: number | null;
      metricas: VendedoraMetricas | null;
    },
  ): VendedoraSugerida {
    const motivos: string[] = [];
    let score: number = PESOS_SUGESTAO.BASE;

    // a. Relacionamento previo (peso forte). Vale por atribuicao direta no
    // cadastro do cliente OU por historico de venda concluida.
    if (this.temRelacionamento(candidata, ctx.vendedoraIdsComVenda, ctx.codigoErpAtribuido)) {
      score += PESOS_SUGESTAO.RELACIONAMENTO;
      motivos.push('ja atendeu este cliente');
    }

    // b. Especialidade (peso medio). Match case-insensitive parcial entre o
    // texto desejado e as especialidades declaradas da vendedora.
    if (ctx.especialidade && this.casaEspecialidade(candidata, ctx.especialidade)) {
      score += PESOS_SUGESTAO.ESPECIALIDADE;
      motivos.push(`especialista em ${ctx.especialidade}`);
    }

    // c. Desempenho (peso menor). Vendedora sem metricas recebe contribuicao
    // neutra (metade do peso), nunca zero — para nao excluir nova vendedora.
    const desempenho = this.pontuarDesempenho(
      ctx.metricas,
      ctx.ticketEstimado,
      motivos,
    );
    score += desempenho;

    score = Math.min(Math.round(score), SCORE_MAXIMO);

    return {
      codigoErp: candidata.codigoErp,
      nome: candidata.nome,
      tipo: candidata.tipo,
      score,
      motivos,
    };
  }

  private temRelacionamento(
    candidata: Vendedora,
    vendedoraIdsComVenda: Set<string>,
    codigoErpAtribuido: string | null,
  ): boolean {
    if (candidata.id && vendedoraIdsComVenda.has(candidata.id)) {
      return true;
    }
    if (
      codigoErpAtribuido &&
      candidata.codigoErp &&
      candidata.codigoErp === codigoErpAtribuido
    ) {
      return true;
    }
    return false;
  }

  private casaEspecialidade(candidata: Vendedora, especialidade: string): boolean {
    return candidata.especialidades.some((e) => {
      const alvo = e.trim().toLowerCase();
      if (alvo.length === 0) return false;
      // Match parcial sensato em ambas as direcoes (ex.: "anel" casa com
      // "aneis de noivado" e vice-versa, sem exigir igualdade exata).
      return alvo.includes(especialidade) || especialidade.includes(alvo);
    });
  }

  /**
   * Contribuicao de desempenho (0..DESEMPENHO_MAX). Combina:
   *  - taxaRecompra (0..1): qualidade de relacionamento da vendedora;
   *  - compatibilidade de ticket: proximidade do ticketMedio ao ticketEstimado
   *    (vendedora cujo ticket medio bate com o do cliente).
   *
   * Sem metricas (vendedora nunca vendeu): retorna a metade do peso (neutro).
   */
  private pontuarDesempenho(
    metricas: VendedoraMetricas | null,
    ticketEstimado: number | null,
    motivos: string[],
  ): number {
    if (!metricas) {
      // Neutro: nao penaliza vendedora nova a ponto de nunca ser sugerida.
      return PESOS_SUGESTAO.DESEMPENHO_MAX / 2;
    }

    // taxaRecompra ja e fracao 0..1; satura em [0,1] por seguranca.
    const fatorRecompra = this.clamp01(metricas.taxaRecompra);

    let fatorTicket: number;
    if (ticketEstimado != null && metricas.ticketMedio > 0) {
      const distancia = Math.abs(metricas.ticketMedio - ticketEstimado);
      const janela = ticketEstimado * JANELA_TICKET_RELATIVA;
      // 1 quando identico, decai linearmente ate 0 na borda da janela.
      fatorTicket = janela > 0 ? this.clamp01(1 - distancia / janela) : 0;
      if (fatorTicket >= 0.5) {
        motivos.push('ticket medio compativel');
      }
    } else {
      // Sem ticket estimado para comparar: fator neutro (0.5).
      fatorTicket = 0.5;
    }

    // Media dos dois fatores ponderada pelo peso de desempenho.
    const fator = (fatorRecompra + fatorTicket) / 2;
    return fator * PESOS_SUGESTAO.DESEMPENHO_MAX;
  }

  private async resolverRelacionamento(
    clienteId: string | null,
  ): Promise<{ vendedoraIdsComVenda: Set<string>; codigoErpAtribuido: string | null }> {
    if (!clienteId) {
      return { vendedoraIdsComVenda: new Set(), codigoErpAtribuido: null };
    }

    const [ids, cliente] = await Promise.all([
      this.vendaRepo.listarVendedoraIdsPorCliente(clienteId),
      this.clienteRepo.buscarPorId(clienteId),
    ]);

    return {
      vendedoraIdsComVenda: new Set(ids),
      codigoErpAtribuido: cliente?.vendedoraCodigoErp ?? null,
    };
  }

  private async indexarMetricas(): Promise<Map<string, VendedoraMetricas>> {
    const metricas = await this.metricasRepo.listar();
    const mapa = new Map<string, VendedoraMetricas>();
    for (const m of metricas) {
      mapa.set(m.vendedoraId, m);
    }
    return mapa;
  }

  private normalizarLimit(limit?: number): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
      return LIMIT_PADRAO;
    }
    return Math.min(Math.floor(limit), LIMIT_MAXIMO);
  }

  private normalizarEspecialidade(valor?: string | null): string | null {
    if (typeof valor !== 'string') return null;
    const limpo = valor.trim().toLowerCase();
    return limpo.length > 0 ? limpo : null;
  }

  private clamp01(valor: number): number {
    if (!Number.isFinite(valor)) return 0;
    if (valor < 0) return 0;
    if (valor > 1) return 1;
    return valor;
  }
}
