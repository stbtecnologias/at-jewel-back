import { Injectable } from '@nestjs/common';
import type { Consignacao } from '../../../../domain/entities/consignacao.entity';
import type {
  AtualizarConsignacaoData,
  ConsignacaoItem,
  FiltroConsignacao,
  IConsignacaoRepository,
  ListaConsignacoes,
  ResumoConsignacoes,
} from '../../../../domain/ports/repositories/consignacao-repository.port';
import { ConsignacaoRepository } from './consignacao.repository';
import { ConsignacoesDeMovimentacaoRepository } from './consignacoes-de-movimentacao.repository';

/**
 * AS DUAS FONTES NUMA LISTA SÓ — 19/11/2026.
 *
 * ==========================================================================
 * A UNIÃO EXISTE PORQUE O BOTÃO FICOU.
 *
 * A tela lê a movimentação, que é onde a consignação de verdade está. Mas o
 * "Nova consignação" continua gravando na tabela — decisão do Lucas em
 * 19/11: *"deixa o botão aí, depois vemos"*.
 *
 * Sem unir, o que alguém cadastrasse não apareceria na lista, e o botão
 * viraria um buraco silencioso: clica, salva, e a tela segue igual. Unir é o
 * que o mantém honesto enquanto ele existir.
 * ==========================================================================
 *
 * ESCRITA VAI SÓ PARA A TABELA, e isso não é arbitrário: não há o que criar
 * nem o que atualizar numa movimentação do ERP. O `atualizar` de uma linha
 * vinda de lá recusa, em vez de fingir que gravou.
 */
@Injectable()
export class ConsignacoesUnidasRepository implements IConsignacaoRepository {
  constructor(
    private readonly tabela: ConsignacaoRepository,
    private readonly erp: ConsignacoesDeMovimentacaoRepository,
  ) {}

  /** A linha do ERP tem id composto — `<movimentacao>:<produto>`. */
  private doErp(id: string): boolean {
    return id.includes(':');
  }

  async listar(filtro: FiltroConsignacao): Promise<ListaConsignacoes> {
    // AS DUAS INTEIRAS, e o corte depois: paginar cada fonte por separado
    // devolveria as 10 primeiras de CADA uma, e a ordem global se perderia.
    // Com 147 abertas e zero na tabela, o custo e teorico — e a protecao vale
    // para o dia em que nao for.
    const [doErp, daTabela] = await Promise.all([
      this.erp.listar({ ...filtro, limit: TETO, offset: 0 }),
      this.tabela.listar({ ...filtro, limit: TETO, offset: 0 }),
    ]);

    const todas = [...doErp.itens, ...daTabela.itens].sort(
      (a, b) => b.dataSaida.getTime() - a.dataSaida.getTime(),
    );

    return {
      itens: todas.slice(filtro.offset, filtro.offset + filtro.limit),
      total: doErp.total + daTabela.total,
    };
  }

  async buscarItemPorId(id: string): Promise<ConsignacaoItem | null> {
    return this.doErp(id)
      ? this.erp.buscarItemPorId(id)
      : this.tabela.buscarItemPorId(id);
  }

  async resumo(
    filtro: Omit<FiltroConsignacao, 'limit' | 'offset'> = {},
  ): Promise<ResumoConsignacoes> {
    const [a, b] = await Promise.all([
      this.erp.resumo(filtro),
      this.tabela.resumo(filtro),
    ]);
    return {
      abertas: a.abertas + b.abertas,
      pecasFora: a.pecasFora + b.pecasFora,
      valorEstimado: a.valorEstimado + b.valorEstimado,
    };
  }

  // ----------------------------------------------------- escrita: só a tabela

  criar(consignacao: Consignacao): Promise<Consignacao> {
    return this.tabela.criar(consignacao);
  }

  buscarPorId(id: string): Promise<Consignacao | null> {
    // A linha do ERP não tem entidade de domínio: ela é derivada, não
    // guardada. Quem pedir por id composto recebe `null`, e o caso de uso
    // responde "não encontrada" — que é a verdade.
    return this.doErp(id) ? Promise.resolve(null) : this.tabela.buscarPorId(id);
  }

  atualizar(
    id: string,
    dados: AtualizarConsignacaoData,
  ): Promise<ConsignacaoItem> {
    return this.tabela.atualizar(id, dados);
  }
}

/**
 * O TETO DA LEITURA DE CADA FONTE antes de unir. Alto de propósito: hoje são
 * 147 linhas no ERP e zero na tabela, e cortar antes de ordenar entregaria a
 * página errada.
 */
const TETO = 5000;
