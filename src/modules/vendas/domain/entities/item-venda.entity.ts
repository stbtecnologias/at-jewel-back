export interface ItemVendaProps {
  id?: string;
  vendaId?: string;
  produtoId?: string | null;
  codigoErpItem?: string | null;
  quantidade: number;
  valorUnitario: number;
  valorCustoUnitario?: number | null;
  valorDescontoItem?: number;
  valorTotalItem: number;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class ItemVenda {
  readonly id: string | undefined;
  readonly vendaId: string | undefined;
  readonly produtoId: string | null;
  readonly codigoErpItem: string | null;
  readonly quantidade: number;
  readonly valorUnitario: number;
  readonly valorCustoUnitario: number | null;
  readonly valorDescontoItem: number;
  readonly valorTotalItem: number;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: ItemVendaProps) {
    this.id = props.id;
    this.vendaId = props.vendaId;
    this.produtoId = props.produtoId ?? null;
    this.codigoErpItem = props.codigoErpItem ?? null;
    this.quantidade = props.quantidade;
    this.valorUnitario = props.valorUnitario;
    this.valorCustoUnitario = props.valorCustoUnitario ?? null;
    this.valorDescontoItem = props.valorDescontoItem ?? 0;
    this.valorTotalItem = props.valorTotalItem;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ItemVendaProps): ItemVenda {
    return new ItemVenda(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      produtoId: this.produtoId,
      codigoErpItem: this.codigoErpItem,
      quantidade: this.quantidade,
      valorUnitario: this.valorUnitario,
      valorCustoUnitario: this.valorCustoUnitario,
      valorDescontoItem: this.valorDescontoItem,
      valorTotalItem: this.valorTotalItem,
    };
  }
}
