import { Inject, Injectable } from '@nestjs/common';
import { VendedoraMetricas } from '../../domain/entities/vendedora-metricas.entity';
import { VENDEDORA_METRICAS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';

@Injectable()
export class ListarVendedorasMetricasUseCase {
  constructor(
    @Inject(VENDEDORA_METRICAS_REPOSITORY)
    private readonly repo: IVendedoraMetricasRepository,
  ) {}

  async execute(): Promise<VendedoraMetricas[]> {
    return this.repo.listar();
  }
}
