import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Empresa } from '../../domain/entities/empresa.entity';
import { EMPRESA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEmpresaRepository } from '../../domain/ports/repositories/empresa-repository.port';

@Injectable()
export class BuscarEmpresaUseCase {
  constructor(
    @Inject(EMPRESA_REPOSITORY)
    private readonly repo: IEmpresaRepository,
  ) {}

  async execute(id: string): Promise<Empresa> {
    const empresa = await this.repo.buscarPorId(id);
    if (!empresa) throw new NotFoundException(`Empresa ${id} nao encontrada`);
    return empresa;
  }
}
