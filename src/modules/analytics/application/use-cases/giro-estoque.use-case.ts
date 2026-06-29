import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroAnalitico,
  GiroFornecedor,
  IAnalyticsRepository,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class GiroEstoqueUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(filtro?: FiltroAnalitico): Promise<GiroFornecedor[]> {
    return this.repo.giroEstoquePorFornecedor(filtro);
  }
}
