import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IAnalyticsRepository,
  Periodo,
  ResumoPeriodo,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class ResumoPeriodoUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  execute(periodo?: Periodo): Promise<ResumoPeriodo> {
    return this.repo.resumoPeriodo(periodo);
  }
}
