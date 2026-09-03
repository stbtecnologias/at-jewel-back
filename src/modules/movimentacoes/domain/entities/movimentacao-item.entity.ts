/**
 * Linha do documento do ERP — `MovimentacaoProduto` do lado de la.
 *
 * ==========================================================================
 * `idErp` AQUI NAO E IDENTIDADE.
 *
 * O campo `id_mesti` do Safira REPETE em todas as linhas da mesma
 * movimentacao: no dump de 03/09/2026, a movimentacao 1354219 tem sete itens,
 * todos com `id_mesti: 1354219`. Ele e o id do DOCUMENTO, nao o da linha.
 *
 * A chave natural e (movimentacao, nItem) — e e ela que esta no UNIQUE da
 * migracao 46. `idErp` fica como atributo, para conferencia com o Alessandro.
 * ==========================================================================
 *
 * SEM CAMPO DE DESCONTO, ao contrario de `itens_venda`: o ERP nao manda um. O
 * `unitario` ja chega com o desconto aplicado — a soma dos itens bate o
 * cabecalho nas 24 movimentacoes do dump, sem sobra.
 */
export interface MovimentacaoItemProps {
  id?: string;
  nItem: number;
  idErp?: string | null;
  produtoId?: string | null;
  produtoIdErp?: string | null;
  quantidade: number;
  valorUnitario: number;
  ativo?: boolean;
}

export class MovimentacaoItem {
  readonly id: string | undefined;
  readonly nItem: number;
  readonly idErp: string | null;
  readonly produtoId: string | null;
  readonly produtoIdErp: string | null;
  readonly quantidade: number;
  readonly valorUnitario: number;
  readonly ativo: boolean;

  private constructor(props: MovimentacaoItemProps) {
    this.id = props.id;
    this.nItem = props.nItem;
    this.idErp = props.idErp ?? null;
    this.produtoId = props.produtoId ?? null;
    this.produtoIdErp = props.produtoIdErp ?? null;
    this.quantidade = props.quantidade;
    this.valorUnitario = props.valorUnitario;
    this.ativo = props.ativo ?? true;
  }

  static create(props: MovimentacaoItemProps): MovimentacaoItem {
    return new MovimentacaoItem(props);
  }

  /** Total da linha. Nao e coluna: e derivavel e nao chega do ERP. */
  get total(): number {
    return this.quantidade * this.valorUnitario;
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      nItem: this.nItem,
      idErpItem: this.idErp,
      produtoId: this.produtoId,
      produtoIdErp: this.produtoIdErp,
      quantidade: this.quantidade,
      valorUnitario: this.valorUnitario,
      total: this.total,
      ativo: this.ativo,
    };
  }
}
