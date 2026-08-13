import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Fornecedor } from '../../domain/entities/fornecedor.entity';
import { FORNECEDOR_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFornecedorRepository } from '../../domain/ports/repositories/fornecedor-repository.port';

@Injectable()
export class BuscarFornecedorUseCase {
  constructor(
    @Inject(FORNECEDOR_REPOSITORY)
    private readonly repo: IFornecedorRepository,
  ) {}

  async execute(id: string): Promise<Fornecedor> {
    const fornecedor = await this.repo.buscarPorId(id);
    if (!fornecedor) {
      throw new NotFoundException(`Fornecedor ${id} nao encontrado`);
    }
    return fornecedor;
  }
}
