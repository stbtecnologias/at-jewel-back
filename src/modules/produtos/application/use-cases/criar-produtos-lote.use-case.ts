import { Inject, Injectable } from '@nestjs/common';
import { Produto } from '../../../erp/domain/entities/produto.entity';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import type { CriarProdutoInput } from './criar-produto.use-case';

@Injectable()
export class CriarProdutosLoteUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
  ) {}

  // Cadastro em lote, all-or-nothing (uma transacao). A validacao por item
  // (campos obrigatorios) ja foi feita pelo ValidationPipe no DTO.
  async execute(inputs: CriarProdutoInput[]): Promise<Produto[]> {
    const produtos = inputs.map((input) =>
      Produto.create({
        ...input,
        codigoErp: input.codigoErp ?? null,
        ativo: true,
      }),
    );
    return this.produtoRepository.saveMany(produtos);
  }
}
