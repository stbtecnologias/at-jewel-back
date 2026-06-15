import { Produto } from '../../entities/produto.entity';

export interface FiltroProduto {
  categoria?: string;
  familia?: string;
  ativo?: boolean;
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
  findAll(filtros: FiltroProduto): Promise<Produto[]>;
  findById(id: string): Promise<Produto | null>;
  save(produto: Produto): Promise<Produto>;
  // Persiste varios produtos numa unica transacao (all-or-nothing).
  saveMany(produtos: Produto[]): Promise<Produto[]>;
  remover(id: string): Promise<void>;
  facetas(): Promise<FacetasProduto>;
  alertasEstoque(limiteBaixo: number, diasGiroLento: number): Promise<AlertasEstoque>;
}
