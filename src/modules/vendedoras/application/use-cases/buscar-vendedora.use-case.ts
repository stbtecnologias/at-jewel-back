import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

@Injectable()
export class BuscarVendedoraUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(id: string): Promise<Vendedora> {
    const vendedora = await this.repo.buscarPorId(id);
    if (!vendedora) {
      throw new NotFoundException(`Vendedora ${id} nao encontrada`);
    }
    return vendedora;
  }
}
