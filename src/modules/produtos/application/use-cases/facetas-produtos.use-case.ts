import { Inject, Injectable } from '@nestjs/common';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type {
  FacetasProduto,
  IProdutoRepository,
} from '../../../erp/domain/ports/repositories/produto-repository.port';

@Injectable()
export class FacetasProdutosUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly repo: IProdutoRepository,
  ) {}

  execute(): Promise<FacetasProduto> {
    return this.repo.facetas();
  }
}
