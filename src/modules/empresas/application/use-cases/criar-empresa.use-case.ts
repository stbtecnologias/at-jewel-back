import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Empresa } from '../../domain/entities/empresa.entity';
import { EMPRESA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEmpresaRepository } from '../../domain/ports/repositories/empresa-repository.port';

export interface CriarEmpresaInput {
  /** Identidade no ERP: chave da tabela la, imutavel. */
  idErp?: string | null;
  /** Codigo de NEGOCIO: a loja escolhe e pode trocar. */
  codigoErp?: string | null;
  nome: string;
}

@Injectable()
export class CriarEmpresaUseCase {
  constructor(
    @Inject(EMPRESA_REPOSITORY)
    private readonly repo: IEmpresaRepository,
  ) {}

  async execute(input: CriarEmpresaInput): Promise<Empresa> {
    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao — imutavel.
    // Checar antes devolve 409 util em vez de violacao crua como 500.
    if (input.idErp) {
      const dup = await this.repo.buscarPorIdErp(input.idErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe empresa com esse id do ERP (id: ${dup.id})`,
        );
      }
    }

    // `codigo_erp` tambem e UNIQUE, mas e codigo de NEGOCIO: pode ser trocado
    // na loja, entao NAO serve como chave de sincronizacao.
    if (input.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe empresa com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    return this.repo.criar(
      Empresa.create({
        idErp: input.idErp ?? null,
        codigoErp: input.codigoErp ?? null,
        nome: input.nome,
        ativo: true,
      }),
    );
  }
}
