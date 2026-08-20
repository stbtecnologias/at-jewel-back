import { Produto } from '../../entities/produto.entity';

export interface FiltroProduto {
  categoria?: string;
  familia?: string;
  ativo?: boolean;
  /**
   * Texto livre. Varre descricao, categoria, familia, colecao, pedra, cor e
   * codigo do ERP — as colunas por onde uma pessoa procura uma joia.
   *
   * Nasceu para o canal interno: a vendedora pergunta "quanto custa o brinco de
   * esmeralda", e ate aqui so dava para filtrar por categoria e familia exatas.
   */
  busca?: string;
  /** Teto de resultados. Sem ele, uma busca vaga devolve o catalogo inteiro. */
  limit?: number;
}

// Valores distintos para preencher filtros na UI.
export interface FacetasProduto {
  fornecedores: string[];
  categorias: string[];
  familias: string[];
}

export interface ProdutoAlerta {
  id: string;
  nome: string;
  categoria: string;
  familia: string;
  fornecedor: string | null;
  estoqueAtual: number;
  diasEmEstoque: number | null;
}

export interface AlertasEstoque {
  estoqueBaixo: ProdutoAlerta[];
  giroLento: ProdutoAlerta[];
}

export interface IProdutoRepository {
  upsertByCodigoErp(produto: Produto): Promise<Produto>;
  findByCodigoErp(codigoErp: string): Promise<Produto | null>;
  /** Identidade no ERP — imutavel, ao contrario do `codigo_erp`. */
  findByIdErp(idErp: string): Promise<Produto | null>;
  findAll(filtros: FiltroProduto): Promise<Produto[]>;
  findById(id: string): Promise<Produto | null>;
  save(produto: Produto): Promise<Produto>;
  // Persiste varios produtos numa unica transacao (all-or-nothing).
  saveMany(produtos: Produto[]): Promise<Produto[]>;
  remover(id: string): Promise<void>;
  facetas(): Promise<FacetasProduto>;
  alertasEstoque(limiteBaixo: number, diasGiroLento: number): Promise<AlertasEstoque>;
}
