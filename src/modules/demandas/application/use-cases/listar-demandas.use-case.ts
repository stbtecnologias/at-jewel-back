import { Inject, Injectable } from '@nestjs/common';
import { DEMANDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroDemanda,
  IDemandaRepository,
  ListaDemandas,
} from '../../domain/ports/repositories/demanda-repository.port';

@Injectable()
export class ListarDemandasUseCase {
  constructor(
    @Inject(DEMANDA_REPOSITORY)
    private readonly repo: IDemandaRepository,
  ) {}

  async execute(filtro: FiltroDemanda): Promise<ListaDemandas> {
    return this.repo.listar(filtro);
  }
}
