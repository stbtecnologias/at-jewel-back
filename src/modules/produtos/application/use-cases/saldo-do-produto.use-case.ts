import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type {
  IProdutoRepository,
  SaldoDaPeca,
} from '../../../erp/domain/ports/repositories/produto-repository.port';

/**
 * Onde está o saldo de uma peça — por empresa, local e grupo.
 *
 * Uma peça pode ter saldo em mais de uma empresa — na carga de 15/09/2026, 111
 * têm linha em duas, e 3 têm saldo nas duas —, e o total que vem no produto
 * não diz em qual. A tela abre isto no detalhe.
 */
@Injectable()
export class SaldoDoProdutoUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly repo: IProdutoRepository,
  ) {}

  async execute(produtoId: string): Promise<SaldoDaPeca[]> {
    // 404 para peça que não existe, e não lista vazia: vazio quer dizer
    // "existe e não tem saldo", e as duas respostas não podem ser a mesma.
    const produto = await this.repo.findById(produtoId);
    if (!produto) throw new NotFoundException('Produto não encontrado');
    return this.repo.saldoPorEmpresa(produtoId);
  }
}
