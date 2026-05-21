import { Inject, Injectable } from '@nestjs/common';
import { Produto } from '../../../erp/domain/entities/produto.entity';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type {
  FiltroProduto,
  IProdutoRepository,
} from '../../../erp/domain/ports/repositories/produto-repository.port';

@Injectable()
export class ListarProdutosUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
  ) {}

  async execute(filtros: FiltroProduto): Promise<Produto[]> {
    return this.produtoRepository.findAll(filtros);
  }
}
