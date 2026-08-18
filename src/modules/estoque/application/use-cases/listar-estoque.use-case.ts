import { Inject, Injectable } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroEstoque,
  IEstoqueRepository,
} from '../../domain/ports/repositories/estoque-repository.port';

@Injectable()
export class ListarEstoqueUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(filtros: FiltroEstoque): Promise<Estoque[]> {
    return this.repo.listar(filtros);
  }
}
