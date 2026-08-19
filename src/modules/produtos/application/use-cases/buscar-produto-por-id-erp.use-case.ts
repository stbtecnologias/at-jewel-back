import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Produto } from '../../../erp/domain/entities/produto.entity';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Diferente dos outros cadastros, produtos nao tinha esse metodo no
 * repositorio: a sincronizacao do catalogo ainda casa por `codigo_erp`
 * (`upsertByCodigoErp`). Aqui a busca passa a existir pela chave imutavel.
 */
@Injectable()
export class BuscarProdutoPorIdErpUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
  ) {}

  async execute(idErp: string): Promise<Produto> {
    const produto = await this.produtoRepository.findByIdErp(idErp);
    if (!produto) throw new NotFoundException(`Produto com id_erp ${idErp} nao encontrado`);
    return produto;
  }
}
