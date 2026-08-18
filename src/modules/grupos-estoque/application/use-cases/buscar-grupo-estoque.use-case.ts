import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GrupoEstoque } from '../../domain/entities/grupo-estoque.entity';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IGrupoEstoqueRepository } from '../../domain/ports/repositories/grupo-estoque-repository.port';

@Injectable()
export class BuscarGrupoEstoqueUseCase {
  constructor(
    @Inject(GRUPO_ESTOQUE_REPOSITORY)
    private readonly repo: IGrupoEstoqueRepository,
  ) {}

  async execute(id: string): Promise<GrupoEstoque> {
    const registro = await this.repo.buscarPorId(id);
    if (!registro) throw new NotFoundException(`Grupo de estoque ${id} nao encontrado`);
    return registro;
  }
}
