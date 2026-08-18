import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';

@Injectable()
export class BuscarEstoqueUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(id: string): Promise<Estoque> {
    const registro = await this.repo.buscarPorId(id);
    if (!registro) throw new NotFoundException(`Saldo de estoque ${id} nao encontrado`);
    return registro;
  }
}
