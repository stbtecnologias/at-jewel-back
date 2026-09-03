/**
 * PARCELA do documento — `MovimentacaoPagamento` do lado de la.
 *
 * ==========================================================================
 * NAO E "A FORMA DE PAGAMENTO DA VENDA". E RECEBIMENTO.
 *
 * A conferencia do dump de 03/09/2026 nao deixa duvida. Das 18 vendas, os
 * pagamentos fecham o total em 4; duas nao tem pagamento nenhum, e nenhuma das
 * 6 devolucoes tem. A movimentacao 1310445 mostra o formato: R$ 123.120 =
 * 100.000 de entrada mais 6 parcelas de 3.853,33 — das quais 2 vieram.
 *
 * Nao e amostra truncada: os `numero` correm sem buraco (vendas de 1120 a
 * 1137, devolucoes de 97 a 102) e as duas vendas sem pagamento estao no MEIO
 * da lista ordenada, nao no fim.
 *
 * Por isso esta entidade NAO participa de nenhum invariante de soma. A de
 * `vendas` (SUM(pagamentos) = valor_total) continua valendo la, para a venda
 * criada pelo painel — e e justamente por ela nao caber aqui que a
 * movimentacao tem tabela propria.
 * ==========================================================================
 *
 * E COMO OS ITENS, `idErp` NAO E IDENTIDADE: `id_recf` repete dentro do
 * documento. Aqui e pior — nao ha nem numero de linha, entao duas parcelas de
 * valor igual sao indistinguiveis. `nParcela` esta previsto e fica nulo ate o
 * Alessandro mandar. Enquanto isso, a ingestao substitui o agregado inteiro em
 * vez de casar linha a linha.
 */
export interface MovimentacaoPagamentoProps {
  id?: string;
  idErp?: string | null;
  nParcela?: number | null;
  formaPagamentoId?: string | null;
  formaPagamentoIdErp?: string | null;
  valor: number;
  /** `debcre` do ERP. Veio 'D' em 100% das 28 linhas do dump. */
  debitoCredito?: 'D' | 'C';
  ativo?: boolean;
}

export class MovimentacaoPagamento {
  readonly id: string | undefined;
  readonly idErp: string | null;
  readonly nParcela: number | null;
  readonly formaPagamentoId: string | null;
  readonly formaPagamentoIdErp: string | null;
  readonly valor: number;
  readonly debitoCredito: 'D' | 'C';
  readonly ativo: boolean;

  private constructor(props: MovimentacaoPagamentoProps) {
    this.id = props.id;
    this.idErp = props.idErp ?? null;
    this.nParcela = props.nParcela ?? null;
    this.formaPagamentoId = props.formaPagamentoId ?? null;
    this.formaPagamentoIdErp = props.formaPagamentoIdErp ?? null;
    this.valor = props.valor;
    this.debitoCredito = props.debitoCredito ?? 'D';
    this.ativo = props.ativo ?? true;
  }

  static create(props: MovimentacaoPagamentoProps): MovimentacaoPagamento {
    return new MovimentacaoPagamento(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      idErpPagamento: this.idErp,
      nParcela: this.nParcela,
      formaPagamentoId: this.formaPagamentoId,
      formaPagamentoIdErp: this.formaPagamentoIdErp,
      valor: this.valor,
      debitoCredito: this.debitoCredito,
      ativo: this.ativo,
    };
  }
}
