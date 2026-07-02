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

  // Com restritoAoSolicitante, demanda de outra pessoa vira 404 (mesma
  // resposta de inexistente, para nao vazar que o id existe).
  async execute(id: string, restritoAoSolicitante?: string): Promise<DemandaItem> {
    if (restritoAoSolicitante !== undefined) {
      const demanda = await this.repo.buscarPorId(id);
      if (!demanda || demanda.solicitanteUserId !== restritoAoSolicitante) {
        throw new NotFoundException('Demanda nao encontrada');
      }
    }
    const item = await this.repo.buscarItemPorId(id);
    if (!item) throw new NotFoundException('Demanda nao encontrada');
    return item;
  }
}
