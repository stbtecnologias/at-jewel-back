import { Inject, Injectable } from '@nestjs/common';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  DefeitoKpis,
  FiltroKpiDefeito,
  IDefeitoRepository,
} from '../../domain/ports/repositories/defeito-repository.port';

@Injectable()
export class KpisDefeitosUseCase {
  constructor(
    @Inject(DEFEITO_REPOSITORY)
    private readonly repo: IDefeitoRepository,
  ) {}

  async execute(filtro: FiltroKpiDefeito): Promise<DefeitoKpis> {
    return this.repo.kpis(filtro);
  }
}
