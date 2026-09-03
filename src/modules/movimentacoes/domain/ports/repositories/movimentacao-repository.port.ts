import { Movimentacao } from '../../entities/movimentacao.entity';

export interface FiltroMovimentacao {
  operacaoId?: string;
  clienteId?: string;
  vendedoraId?: string;
  ativo?: boolean;
  /** Inclusivo nas duas pontas, sobre `data_movimentacao`. */
  de?: Date;
  ate?: Date;
  /** Somente as que ainda nao viraram venda — a fila da projecao. */
  semVenda?: boolean;
  limite?: number;
  offset?: number;
}

export interface PaginaMovimentacoes {
  itens: Movimentacao[];
  total: number;
}

export interface IMovimentacaoRepository {
  /**
   * Upsert do AGREGADO inteiro, por `id_erp`, em UMA transacao.
   *
   * Reenvio apaga itens e pagamentos e regrava. Nao e preguica: os filhos nao
   * tem chave natural utilizavel — `id_mesti` e `id_recf` repetem dentro do
   * documento, e o pagamento nao tem sequer numero de linha, entao duas
   * parcelas de valor igual sao indistinguiveis. Casar linha a linha exigiria
   * uma chave que o ERP nao manda.
   *
   * A idempotencia mora no cabecalho, onde ha chave de verdade.
   *
   * PRESERVA `venda_id`: a projecao e nossa, e ressincronizar o documento nao
   * pode desfaze-la. Quando a projecao existir, ela decidira se precisa
   * refazer o trabalho comparando o que mudou.
   */
  sincronizar(mov: Movimentacao): Promise<{ mov: Movimentacao; criada: boolean }>;

  /** Com o agregado carregado. */
  buscarPorId(id: string): Promise<Movimentacao | null>;
  buscarPorIdErp(idErp: string): Promise<Movimentacao | null>;

  /** Sem o agregado — `toResumo` e o que a listagem devolve. */
  listar(filtros: FiltroMovimentacao): Promise<PaginaMovimentacoes>;
}
