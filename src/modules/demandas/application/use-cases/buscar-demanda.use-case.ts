import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DEMANDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  DemandaItem,
  IDemandaRepository,
} from '../../domain/ports/repositories/demanda-repository.port';

@Injectable()
export class BuscarDemandaUseCase {
  constructor(
    @Inject(DEMANDA_REPOSITORY)
    private readonly repo: IDemandaRepository,
  ) {}

  async execute(id: string): Promise<DemandaItem> {
    const item = await this.repo.buscarItemPorId(id);
    if (!item) throw new NotFoundException('Demanda nao encontrada');
    return item;
  }
}
