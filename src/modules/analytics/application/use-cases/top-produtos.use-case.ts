import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IAnalyticsRepository,
  TopProduto,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class TopProdutosUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(limit = 10): Promise<TopProduto[]> {
    const n = Math.min(100, Math.max(1, Math.trunc(limit) || 10));
    return this.repo.topProdutos(n);
  }
}
