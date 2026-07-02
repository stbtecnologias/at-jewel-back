import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroAnalitico,
  GiroFamilia,
  IAnalyticsRepository,
} from '../../domain/ports/repositories/analytics-repository.port';

// Giro de estoque por familia de produto (RF-15). Espelha o use case por
// fornecedor; toda a agregacao roda em SQL parametrizado. Sem PII.
@Injectable()
export class GiroFamiliasUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(filtro?: FiltroAnalitico): Promise<GiroFamilia[]> {
    return this.repo.giroEstoquePorFamilia(filtro);
  }
}
