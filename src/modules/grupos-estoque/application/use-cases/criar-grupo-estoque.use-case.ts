import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { GrupoEstoque } from '../../domain/entities/grupo-estoque.entity';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IGrupoEstoqueRepository } from '../../domain/ports/repositories/grupo-estoque-repository.port';

export interface CriarGrupoEstoqueInput {
  codigoErp?: string | null;
  nome: string;
}

@Injectable()
export class CriarGrupoEstoqueUseCase {
  constructor(
    @Inject(GRUPO_ESTOQUE_REPOSITORY)
    private readonly repo: IGrupoEstoqueRepository,
  ) {}

  async execute(input: CriarGrupoEstoqueInput): Promise<GrupoEstoque> {
    // `codigo_erp` e UNIQUE e e a chave de idempotencia da sincronizacao.
    // Checar antes devolve 409 util em vez de violacao crua como 500.
    if (input.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe grupo de estoque com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    return this.repo.criar(
      GrupoEstoque.create({
        codigoErp: input.codigoErp ?? null,
        nome: input.nome,
        ativo: true,
      }),
    );
  }
}
