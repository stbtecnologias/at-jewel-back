import { Inject, Injectable } from '@nestjs/common';
import { GrupoEstoque } from '../../domain/entities/grupo-estoque.entity';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroGrupoEstoque,
  IGrupoEstoqueRepository,
} from '../../domain/ports/repositories/grupo-estoque-repository.port';

@Injectable()
export class ListarGruposEstoqueUseCase {
  constructor(
    @Inject(GRUPO_ESTOQUE_REPOSITORY)
    private readonly repo: IGrupoEstoqueRepository,
  ) {}

  async execute(filtros: FiltroGrupoEstoque = {}): Promise<GrupoEstoque[]> {
    return this.repo.listar(filtros);
  }
}
