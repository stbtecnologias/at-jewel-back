import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Empresa } from '../../domain/entities/empresa.entity';
import { EMPRESA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEmpresaRepository } from '../../domain/ports/repositories/empresa-repository.port';

export interface AtualizarEmpresaInput {
  codigoErp?: string | null;
  nome?: string;
  ativo?: boolean;
}

@Injectable()
export class AtualizarEmpresaUseCase {
  constructor(
    @Inject(EMPRESA_REPOSITORY)
    private readonly repo: IEmpresaRepository,
  ) {}

  async execute(id: string, input: AtualizarEmpresaInput): Promise<Empresa> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Empresa ${id} nao encontrada`);

    // `undefined` = campo ausente no PATCH, mantem o atual. `null` = limpar.
    const codigoErp = input.codigoErp !== undefined ? input.codigoErp : atual.codigoErp;

    if (codigoErp && codigoErp !== atual.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(codigoErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `Ja existe empresa com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    return this.repo.atualizar(
      Empresa.create({
        id: atual.id,
        codigoErp,
        nome: input.nome ?? atual.nome,
        ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
        criadoEm: atual.criadoEm,
        atualizadoEm: new Date(),
      }),
    );
  }
}
