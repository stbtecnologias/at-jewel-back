import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  Demografia,
  FiltroAnalitico,
  IAnalyticsRepository,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class DemografiaUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(filtro?: FiltroAnalitico): Promise<Demografia> {
    return this.repo.demografia(filtro);
  }
}
