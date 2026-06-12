export interface ProdutoProps {
  id?: string;
  codigoErp: string | null;
  categoria: string;
  familia: string;
  colecao?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  tipoPedra?: string | null;
  colecaoPedra?: string | null;
  referenciaFornecedor?: string | null;
  descricaoEtiqueta?: string | null;
  pesoGramas?: number | null;
  unidade: string;
  valorCompra?: number | null;
  valorCusto?: number | null;
  margemPercentual?: number | null;
  valorVenda: number;
  observacao?: string | null;
  fotoUrl?: string | null;
  ativo: boolean;
  estoqueAtual?: number | null;
  dataEntradaEstoque?: Date | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Produto {
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly categoria: string;
  readonly familia: string;
  readonly colecao: string | null;
  readonly cor: string | null;
  readonly tamanho: string | null;
  readonly tipoPedra: string | null;
  readonly colecaoPedra: string | null;
  readonly referenciaFornecedor: string | null;
  readonly descricaoEtiqueta: string | null;
  readonly pesoGramas: number | null;
  readonly unidade: string;
  readonly valorCompra: number | null;
  readonly valorCusto: number | null;
  readonly margemPercentual: number | null;
  readonly valorVenda: number;
  readonly observacao: string | null;
  readonly fotoUrl: string | null;
  readonly ativo: boolean;
  readonly estoqueAtual: number;
  readonly dataEntradaEstoque: Date | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: ProdutoProps) {
    this.id = props.id;
    this.codigoErp = props.codigoErp;
    this.categoria = props.categoria;
    this.familia = props.familia;
    this.colecao = props.colecao ?? null;
    this.cor = props.cor ?? null;
    this.tamanho = props.tamanho ?? null;
    this.tipoPedra = props.tipoPedra ?? null;
    this.colecaoPedra = props.colecaoPedra ?? null;
    this.referenciaFornecedor = props.referenciaFornecedor ?? null;
    this.descricaoEtiqueta = props.descricaoEtiqueta ?? null;
    this.pesoGramas = props.pesoGramas ?? null;
    this.unidade = props.unidade;
    this.valorCompra = props.valorCompra ?? null;
    this.valorCusto = props.valorCusto ?? null;
    this.margemPercentual = props.margemPercentual ?? null;
    this.valorVenda = props.valorVenda;
    this.observacao = props.observacao ?? null;
    this.fotoUrl = props.fotoUrl ?? null;
    this.ativo = props.ativo;
    this.estoqueAtual = props.estoqueAtual ?? 0;
    this.dataEntradaEstoque = props.dataEntradaEstoque ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ProdutoProps): Produto {
    return new Produto(props);
  }
}
