import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../domain/ports/repositories/local-estoque-repository.port';

@Injectable()
export class BuscarLocalEstoqueUseCase {
  constructor(
    @Inject(LOCAL_ESTOQUE_REPOSITORY)
    private readonly repo: ILocalEstoqueRepository,
  ) {}

  async execute(id: string): Promise<LocalEstoque> {
    const registro = await this.repo.buscarPorId(id);
    if (!registro) throw new NotFoundException(`Local de estoque ${id} nao encontrado`);
    return registro;
  }
}
