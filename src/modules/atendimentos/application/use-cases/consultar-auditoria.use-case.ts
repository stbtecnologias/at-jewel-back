import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { VENDA_REPOSITORY } from '../../../vendas/domain/ports/injection-tokens';
import type { IVendaRepository } from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  AtendimentoAuditoria,
  BucketAuditoria,
  FiltroAuditoria,
  GranularidadeSerie,
  IAtendimentoRepository,
  Interacao,
  ResumoAuditoria,
} from '../../domain/ports/repositories/atendimento-repository.port';

/** Teto de linhas por pagina. Acima disto a tela nao lê, ela despeja. */
export const MAXIMO_POR_PAGINA = 100;
const PADRAO_POR_PAGINA = 25;

export interface DetalheAtendimento extends AtendimentoAuditoria {
  interacoes: Interacao[];
}

/**
 * Um balde da linha do tempo com o que foi vendido no mesmo intervalo.
 *
 * ==========================================================================
 * `vendido` NAO E ATRIBUICAO, E CONTEXTO.
 *
 * Sao as vendas fechadas naquele dia/semana pela mesma vendedora (ou pela
 * equipe, quando nao ha uma escolhida) — e NAO o que estes atendimentos
 * geraram. Nao existe vinculo entre venda e atendimento no banco; enquanto
 * nao existir, ninguem pode dizer que a venda saiu daquele contato.
 *
 * A tela precisa dizer "vendido no periodo" com essas palavras. Chamar de
 * "gerado por estes atendimentos" seria uma afirmacao que o dado nao sustenta,
 * e ninguem perceberia o erro olhando o numero.
 * ==========================================================================
 */
export interface BucketSerie extends BucketAuditoria {
  vendido: { vendas: number; receita: number; ticketMedio: number } | null;
}

/**
 * A leitura de gestao sobre os atendimentos da equipe.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE
 *
 * `atendimentos` e `atendimento_interacoes` guardam o episodio inteiro desde
 * 19/08 — quem atendeu quem, o combinado, o lembrete, a cobranca, o relato e o
 * desfecho — e NINGUEM NUNCA LEU. Ate aqui, saber se a vendedora falou com a
 * cliente dependia de perguntar a ela.
 *
 * O QUE ESTA LEITURA NAO E: nao e a conversa entre cliente e vendedora. Essa
 * acontece entre dois telefones pessoais, fora de qualquer sistema nosso, e
 * captura-la exigiria conectar o WhatsApp pessoal de gente externa. O que
 * temos — e e bastante — e o que a vendedora RELATOU, com data e hora.
 * ==========================================================================
 */
@Injectable()
export class ConsultarAuditoriaUseCase {
  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
    @Inject(VENDA_REPOSITORY)
    private readonly vendas: IVendaRepository,
  ) {}

  async listar(
    filtros: Partial<FiltroAuditoria>,
  ): Promise<{ itens: AtendimentoAuditoria[]; total: number }> {
    return this.atendimentos.listarAuditoria({
      ...filtros,
      limit: Math.min(filtros.limit ?? PADRAO_POR_PAGINA, MAXIMO_POR_PAGINA),
      offset: filtros.offset ?? 0,
    });
  }

  async resumo(
    filtros: Pick<FiltroAuditoria, 'de' | 'ate' | 'etapa'>,
  ): Promise<ResumoAuditoria> {
    return this.atendimentos.resumoAuditoria(filtros);
  }

  /**
   * A linha do tempo agregada: um balde por dia, ou por semana.
   *
   * As duas consultas sao INDEPENDENTES — atendimentos vem de `aberto_em`,
   * vendas de `data_venda` — e casam pelo comeco do balde. Balde sem venda
   * nenhuma fica com `vendido` zerado, e nao nulo: zero vendido e um fato, e
   * a tela precisa poder mostra-lo.
   */
  async serie(
    filtros: Pick<FiltroAuditoria, 'de' | 'ate' | 'etapa' | 'vendedoraId'>,
    granularidade: GranularidadeSerie,
  ): Promise<BucketSerie[]> {
    const [baldes, vendas] = await Promise.all([
      this.atendimentos.serieAuditoria(filtros, granularidade),
      this.vendas.serieAgregada(
        {
          dataDe: filtros.de,
          dataAte: filtros.ate,
          vendedoraId: filtros.vendedoraId,
        },
        granularidade,
      ),
    ]);

    const porInicio = new Map(vendas.map((v) => [v.inicio.getTime(), v]));

    return baldes.map((b) => {
      const v = porInicio.get(b.inicio.getTime());
      return {
        ...b,
        vendido: v
          ? { vendas: v.vendas, receita: v.receita, ticketMedio: v.ticketMedio }
          : { vendas: 0, receita: 0, ticketMedio: 0 },
      };
    });
  }

  /**
   * Um episodio, com a linha do tempo inteira.
   *
   * A busca vem do repositorio de dominio e nao da view, porque a view nao
   * traz `interacoes` — e o nome do cliente e da vendedora sao resolvidos
   * aqui, um a um, o que so faz sentido para UM atendimento.
   */
  async detalhe(id: string): Promise<DetalheAtendimento> {
    // A MESMA view da listagem, filtrada por id. Recalcular a etapa aqui
    // criaria uma segunda definicao dela — que e exatamente o que a migracao
    // 38 existe para evitar.
    const [pagina, interacoes] = await Promise.all([
      this.atendimentos.listarAuditoria({ id, limit: 1, offset: 0 }),
      this.atendimentos.listarInteracoes(id),
    ]);

    const cabecalho = pagina.itens[0];
    if (!cabecalho) throw new NotFoundException('Atendimento nao encontrado');

    return { ...cabecalho, interacoes };
  }
}
