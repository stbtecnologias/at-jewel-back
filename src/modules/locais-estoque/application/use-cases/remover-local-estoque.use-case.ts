import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../domain/ports/repositories/local-estoque-repository.port';

/**
 * Exclusao FISICA. O caminho do dia a dia e PATCH com ativo:false — registro
 * desativado some das selecoes e o historico continua consultavel.
 *
 * DIFERENTE dos outros cadastros: `estoque.local_estoque_id` e uma FK NOT NULL
 * apontando para ca. O banco IMPEDE apagar um local de estoque que tenha saldo
 * vinculado — a chamada falha, em vez de deixar saldo orfao.
 */
@Injectable()
export class RemoverLocalEstoqueUseCase {
  constructor(
    @Inject(LOCAL_ESTOQUE_REPOSITORY)
    private readonly repo: ILocalEstoqueRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException(`LocalEstoque ${id} nao encontrada`);
    await this.repo.remover(id);
  }
}
