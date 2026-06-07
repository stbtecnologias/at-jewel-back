import { Inject, Injectable } from '@nestjs/common';
import { VENDEDORA_METRICAS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';

@Injectable()
export class RefreshVendedorasMetricasUseCase {
  constructor(
    @Inject(VENDEDORA_METRICAS_REPOSITORY)
    private readonly repo: IVendedoraMetricasRepository,
  ) {}

  /**
   * Recomputa a matview vendedoras_metricas.
   *
   * O refresh e CONCURRENTLY (no repositorio), entao nao bloqueia leituras
   * do dashboard durante a recomputacao. Disparo recorrente (diario) e
   * responsabilidade de um cron/n8n externo chamando o endpoint.
   */
  async execute(): Promise<{ atualizadoEm: Date }> {
    await this.repo.refresh();
    return { atualizadoEm: new Date() };
  }
}
