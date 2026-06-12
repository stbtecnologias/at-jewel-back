import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  EstatisticasInventario,
  IAnalyticsRepository,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class EstatisticasInventarioUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(): Promise<EstatisticasInventario> {
    return this.repo.estatisticasInventario();
  }
}
