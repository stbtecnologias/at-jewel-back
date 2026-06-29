import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroAnalitico,
  IAnalyticsRepository,
  ResumoPeriodo,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class ResumoPeriodoUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  execute(filtro?: FiltroAnalitico): Promise<ResumoPeriodo> {
    return this.repo.resumoPeriodo(filtro);
  }
}
