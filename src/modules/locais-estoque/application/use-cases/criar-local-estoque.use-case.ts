import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../domain/ports/repositories/local-estoque-repository.port';

export interface CriarLocalEstoqueInput {
  codigoErp?: string | null;
  nome: string;
}

@Injectable()
export class CriarLocalEstoqueUseCase {
  constructor(
    @Inject(LOCAL_ESTOQUE_REPOSITORY)
    private readonly repo: ILocalEstoqueRepository,
  ) {}

  async execute(input: CriarLocalEstoqueInput): Promise<LocalEstoque> {
    // `codigo_erp` e UNIQUE e e a chave de idempotencia da sincronizacao.
    // Checar antes devolve 409 util em vez de violacao crua como 500.
    if (input.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe local de estoque com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    return this.repo.criar(
      LocalEstoque.create({
        codigoErp: input.codigoErp ?? null,
        nome: input.nome,
        ativo: true,
      }),
    );
  }
}
