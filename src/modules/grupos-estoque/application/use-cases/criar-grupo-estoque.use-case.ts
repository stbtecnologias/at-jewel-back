import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { GrupoEstoque } from '../../domain/entities/grupo-estoque.entity';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IGrupoEstoqueRepository } from '../../domain/ports/repositories/grupo-estoque-repository.port';

export interface CriarGrupoEstoqueInput {
  /** Identidade no ERP: chave tecnica, imutavel. */
  idErp?: string | null;
  /** Codigo de NEGOCIO: a loja escolhe e pode trocar. */
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
    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao. Checar antes
    // devolve 409 util em vez de violacao crua do Postgres como 500.
    if (input.idErp) {
      const dup = await this.repo.buscarPorIdErp(input.idErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe grupo de estoque com esse id do ERP (id: ${dup.id})`,
        );
      }
    }

    // `codigo_erp` tambem e UNIQUE, mas e codigo de NEGOCIO — pode ser trocado
    // na loja, entao NAO serve como chave de sincronizacao.
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
        idErp: input.idErp ?? null,
        codigoErp: input.codigoErp ?? null,
        nome: input.nome,
        ativo: true,
      }),
    );
  }
}
