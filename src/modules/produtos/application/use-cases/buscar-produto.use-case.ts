import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Produto } from '../../../erp/domain/entities/produto.entity';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';

@Injectable()
export class BuscarProdutoUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
  ) {}

  async execute(id: string): Promise<Produto> {
    const produto = await this.produtoRepository.findById(id);
    if (!produto) throw new NotFoundException(`Produto ${id} não encontrado`);
    return produto;
  }
}
