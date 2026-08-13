import { Inject, Injectable } from '@nestjs/common';
import { Empresa } from '../../domain/entities/empresa.entity';
import { EMPRESA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroEmpresa,
  IEmpresaRepository,
} from '../../domain/ports/repositories/empresa-repository.port';

@Injectable()
export class ListarEmpresasUseCase {
  constructor(
    @Inject(EMPRESA_REPOSITORY)
    private readonly repo: IEmpresaRepository,
  ) {}

  async execute(filtros: FiltroEmpresa = {}): Promise<Empresa[]> {
    return this.repo.listar(filtros);
  }
}
