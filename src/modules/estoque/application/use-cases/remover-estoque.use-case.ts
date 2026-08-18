import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';

/**
 * Exclusao FISICA da linha de saldo.
 *
 * Nao existe "desativar" aqui: saldo nao tem `ativo`. Zerar a quantidade e
 * diferente de apagar — zero significa "ja esteve aqui e hoje nao tem", e essa
 * informacao costuma valer. Apagar e para corrigir linha que nunca deveria ter
 * existido.
 */
@Injectable()
export class RemoverEstoqueUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Saldo de estoque ${id} nao encontrado`);
    await this.repo.remover(id);
  }
}
