import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { VendedoraMetricas } from '../../domain/entities/vendedora-metricas.entity';
import { VENDEDORA_METRICAS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';

@Injectable()
export class BuscarVendedoraMetricasUseCase {
  constructor(
    @Inject(VENDEDORA_METRICAS_REPOSITORY)
    private readonly repo: IVendedoraMetricasRepository,
  ) {}

  async execute(vendedoraId: string): Promise<VendedoraMetricas> {
    const metricas = await this.repo.buscarPorVendedoraId(vendedoraId);
    if (!metricas) {
      // Vendedora sem venda concluida nao tem linha na matview. Tratamos
      // como "metricas nao encontradas" (a vendedora pode existir, mas nao
      // ha agregado para ela ainda).
      throw new NotFoundException(
        `Metricas da vendedora ${vendedoraId} nao encontradas`,
      );
    }
    return metricas;
  }
}
