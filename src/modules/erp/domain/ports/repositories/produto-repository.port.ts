import { Produto } from '../../entities/produto.entity';

export interface IProdutoRepository {
  upsertByCodigoErp(produto: Produto): Promise<Produto>;
  findByCodigoErp(codigoErp: string): Promise<Produto | null>;
}
