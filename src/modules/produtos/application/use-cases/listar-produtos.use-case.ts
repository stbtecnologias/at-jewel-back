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

  /** Quantas existem com esse filtro, ignorando o teto da lista. */
  async contar(filtros: FiltroProduto): Promise<number> {
    return this.produtoRepository.contar(filtros);
  }

  /**
   * Os tipos de peca que existem no catalogo — 28/09/2026.
   *
   * Serve a agente conferir a familia ANTES de consultar: o modelo escreve o
   * que a pessoa falou ("bracelete"), e o catalogo tem outra palavra
   * ("PULSEIRA"). Sem a conferencia, a consulta devolveria zero linhas — e
   * zero e indistinguivel de "ninguem vendeu isso no periodo".
   *
   * Sai das FACETAS, que ja calculam isto para os filtros da tela: uma
   * consulta propria de "quais familias existem" divergiria da primeira no dia
   * em que alguem mudasse o criterio de uma delas.
   */
  async familias(): Promise<string[]> {
    return (await this.produtoRepository.facetas()).familias;
  }
}
