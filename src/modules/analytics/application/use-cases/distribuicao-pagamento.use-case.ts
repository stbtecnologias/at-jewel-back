import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  DistribuicaoPagamento,
  IAnalyticsRepository,
} from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class DistribuicaoPagamentoUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(): Promise<DistribuicaoPagamento[]> {
    return this.repo.distribuicaoPagamento();
  }
}
