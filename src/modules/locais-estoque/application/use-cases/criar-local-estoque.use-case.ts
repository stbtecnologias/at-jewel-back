import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../domain/ports/repositories/local-estoque-repository.port';

export interface CriarLocalEstoqueInput {
  /** Identidade no ERP: chave tecnica, imutavel. */
  idErp?: string | null;
  /** Codigo de NEGOCIO: a loja escolhe e pode trocar. */
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
    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao. Checar antes
    // devolve 409 util em vez de violacao crua do Postgres como 500.
    if (input.idErp) {
      const dup = await this.repo.buscarPorIdErp(input.idErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe local de estoque com esse id do ERP (id: ${dup.id})`,
        );
      }
    }

    // `codigo_erp` tambem e UNIQUE, mas e codigo de NEGOCIO — pode ser trocado
    // na loja, entao NAO serve como chave de sincronizacao.
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
        idErp: input.idErp ?? null,
        codigoErp: input.codigoErp ?? null,
        nome: input.nome,
        ativo: true,
      }),
    );
  }
}
