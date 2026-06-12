import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IAnalyticsRepository,
  ReceitaMensal,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class ReceitaMensalUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  // Limita a janela a [1, 36] meses para conter o custo da agregacao.
  async execute(meses = 6): Promise<ReceitaMensal> {
    const janela = Math.min(36, Math.max(1, Math.trunc(meses) || 6));
    return this.repo.receitaMensal(janela);
  }
}
