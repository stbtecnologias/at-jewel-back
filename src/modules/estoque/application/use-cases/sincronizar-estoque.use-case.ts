import { Inject, Injectable } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';
import type { CriarEstoqueInput } from './criar-estoque.use-case';

/**
 * Caminho da INTEGRACAO com o ERP. O Safira manda a FOTO do saldo, e mandar a
 * mesma foto de novo e o comportamento normal — nao erro. Por isso e upsert
 * sobre a chave, e nao um POST que conflita na segunda rodada.
 *
 * Idempotente: N chamadas iguais deixam o banco no mesmo estado de uma.
 *
 * A validacao de "exatamente um local" saiu com a migracao 57 — ver
 * `CriarEstoqueUseCase`. O `localEstoqueId` obrigatorio do DTO faz o trabalho.
 */
@Injectable()
export class SincronizarEstoqueUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(input: CriarEstoqueInput): Promise<Estoque> {
    return this.repo.upsert(Estoque.create(input));
  }
}
