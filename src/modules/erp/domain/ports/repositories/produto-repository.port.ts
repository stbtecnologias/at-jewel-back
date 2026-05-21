import { Produto } from '../../entities/produto.entity';

export interface FiltroProduto {
  categoria?: string;
  familia?: string;
  ativo?: boolean;
}

export interface IProdutoRepository {
  upsertByCodigoErp(produto: Produto): Promise<Produto>;
  findByCodigoErp(codigoErp: string): Promise<Produto | null>;
  findAll(filtros: FiltroProduto): Promise<Produto[]>;
  findById(id: string): Promise<Produto | null>;
  save(produto: Produto): Promise<Produto>;
  remover(id: string): Promise<void>;
}
