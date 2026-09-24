import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  aparaIdErp,
  normalizarIdErp,
} from '../../../../shared/erp/normalizar-id-erp';
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
    // ====================================================================
    // A CHAVE E NORMALIZADA, O ECO E FIEL — migracao 65, 24/09/2026.
    //
    // O integrador manda "009000000018" e a movimentacao do Safira chega
    // com 9000000018. Sem normalizar aqui, a ponta da movimentacao nunca
    // acharia este local. Ver `shared/erp/normalizar-id-erp.ts`.
    //
    // O bruto e so `aparaIdErp` — tira espaco e o `.0` de serializacao, e
    // preserva os zeros, que e o que ele quer ver de volta.
    // ====================================================================
    const idErp = normalizarIdErp(input.idErp);
    const idErpBruto = aparaIdErp(input.idErp);

    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao. Checar antes
    // devolve 409 util em vez de violacao crua do Postgres como 500.
    if (idErp) {
      const dup = await this.repo.buscarPorIdErp(idErp);
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
        idErp,
        idErpBruto,
        codigoErp: input.codigoErp ?? null,
        nome: input.nome,
        ativo: true,
      }),
    );
  }
}
