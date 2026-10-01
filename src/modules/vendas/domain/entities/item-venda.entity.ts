export interface ItemVendaProps {
  id?: string;
  vendaId?: string;
  produtoId?: string | null;
  /** Identidade do item no ERP. */
  idErpItem?: string | null;
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
  readonly idErpItem: string | null;
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
    this.idErpItem = props.idErpItem ?? null;
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

  /**
   * @param custo `produtos:custo`. **Sem ele a chave do custo nao existe.**
   *
   * ========================================================================
   * O CUSTO SAIA POR AQUI, E E REINCIDENCIA — 01/10/2026.
   *
   * Em 28/09 o custo foi fechado no serializador do PRODUTO, com a licao
   * escrita no proprio repositorio: "um campo sensivel nao se protege no
   * serializador, se protege em TODA porta por onde ele sai". Esta porta
   * ficou: `GET /vendas/:id` exige so `vendas:read_all`, e `GERENTE_VENDAS`
   * tem essa chave sem ter `produtos:custo` — de proposito, pela migracao 72.
   *
   * O espalhamento condicional e o que faz a chave DESAPARECER. Um
   * `valorCustoUnitario: null` ainda contaria quantas pecas nao tem custo,
   * e num item com valor ao lado entregaria quais tem. Chave ausente nao
   * responde nada disso — e o criterio CA-02 de 28/09 e literalmente
   * "ausencia da chave, nao valor nulo".
   * ========================================================================
   */
  toPublic(custo = false): Record<string, unknown> {
    return {
      id: this.id,
      produtoId: this.produtoId,
      idErpItem: this.idErpItem,
      codigoErpItem: this.codigoErpItem,
      quantidade: this.quantidade,
      valorUnitario: this.valorUnitario,
      valorDescontoItem: this.valorDescontoItem,
      valorTotalItem: this.valorTotalItem,
      ...(custo ? { valorCustoUnitario: this.valorCustoUnitario } : {}),
    };
  }
}
