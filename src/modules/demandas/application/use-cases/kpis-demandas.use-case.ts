import { Inject, Injectable } from '@nestjs/common';
import { DEMANDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroDemanda,
  IDemandaRepository,
  KpisDemandas,
} from '../../domain/ports/repositories/demanda-repository.port';

@Injectable()
export class KpisDemandasUseCase {
  constructor(
    @Inject(DEMANDA_REPOSITORY)
    private readonly repo: IDemandaRepository,
  ) {}

  /** O escopo do solicitante e o filtro da lista — ver o repositorio. */
  async execute(
    solicitanteUserId?: string,
    filtro?: Omit<FiltroDemanda, 'limit' | 'offset' | 'solicitanteUserId'>,
  ): Promise<KpisDemandas> {
    return this.repo.kpis(solicitanteUserId, filtro);
  }
}
