import { Inject, Injectable } from '@nestjs/common';
import { Fornecedor } from '../../domain/entities/fornecedor.entity';
import { FORNECEDOR_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroFornecedor,
  IFornecedorRepository,
} from '../../domain/ports/repositories/fornecedor-repository.port';

@Injectable()
export class ListarFornecedoresUseCase {
  constructor(
    @Inject(FORNECEDOR_REPOSITORY)
    private readonly repo: IFornecedorRepository,
  ) {}

  async execute(filtros: FiltroFornecedor = {}): Promise<Fornecedor[]> {
    return this.repo.listar(filtros);
  }
}
