import { Inject, Injectable } from '@nestjs/common';
import { DEMANDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IDemandaRepository,
  KpisDemandas,
} from '../../domain/ports/repositories/demanda-repository.port';

@Injectable()
export class KpisDemandasUseCase {
  constructor(
    @Inject(DEMANDA_REPOSITORY)
    private readonly repo: IDemandaRepository,
  ) {}

  async execute(): Promise<KpisDemandas> {
    return this.repo.kpis();
  }
}
