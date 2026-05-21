import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';

@Injectable()
export class RemoverProdutoUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.produtoRepository.findById(id);
    if (!existente) throw new NotFoundException(`Produto ${id} não encontrado`);
    await this.produtoRepository.remover(id);
  }
}
