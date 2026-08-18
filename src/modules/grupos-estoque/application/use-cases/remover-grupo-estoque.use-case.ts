import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IGrupoEstoqueRepository } from '../../domain/ports/repositories/grupo-estoque-repository.port';

/**
 * Exclusao FISICA. O caminho do dia a dia e PATCH com ativo:false — registro
 * desativado some das selecoes e o historico continua consultavel.
 *
 * DIFERENTE dos outros cadastros: `estoque.grupo_estoque_id` e uma FK NOT NULL
 * apontando para ca. O banco IMPEDE apagar um grupo de estoque que tenha saldo
 * vinculado — a chamada falha, em vez de deixar saldo orfao.
 */
@Injectable()
export class RemoverGrupoEstoqueUseCase {
  constructor(
    @Inject(GRUPO_ESTOQUE_REPOSITORY)
    private readonly repo: IGrupoEstoqueRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException(`GrupoEstoque ${id} nao encontrada`);
    await this.repo.remover(id);
  }
}
