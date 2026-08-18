import { Inject, Injectable } from '@nestjs/common';
import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroLocalEstoque,
  ILocalEstoqueRepository,
} from '../../domain/ports/repositories/local-estoque-repository.port';

@Injectable()
export class ListarLocaisEstoqueUseCase {
  constructor(
    @Inject(LOCAL_ESTOQUE_REPOSITORY)
    private readonly repo: ILocalEstoqueRepository,
  ) {}

  async execute(filtros: FiltroLocalEstoque = {}): Promise<LocalEstoque[]> {
    return this.repo.listar(filtros);
  }
}
