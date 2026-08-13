import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Empresa } from '../../domain/entities/empresa.entity';
import { EMPRESA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEmpresaRepository } from '../../domain/ports/repositories/empresa-repository.port';

export interface CriarEmpresaInput {
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
    // `codigo_erp` e UNIQUE e e a chave de idempotencia da sincronizacao.
    // Checar antes devolve 409 util em vez de violacao crua como 500.
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
        codigoErp: input.codigoErp ?? null,
        nome: input.nome,
        ativo: true,
      }),
    );
  }
}
