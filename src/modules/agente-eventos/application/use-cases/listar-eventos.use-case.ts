import { Inject, Injectable } from '@nestjs/common';
import { AgenteEvento } from '../../domain/entities/agente-evento.entity';
import { AGENTE_EVENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroAgenteEvento,
  IAgenteEventoRepository,
} from '../../domain/ports/repositories/agente-evento-repository.port';

@Injectable()
export class ListarEventosUseCase {
  constructor(
    @Inject(AGENTE_EVENTO_REPOSITORY)
    private readonly repo: IAgenteEventoRepository,
  ) {}

  async execute(filtros: FiltroAgenteEvento): Promise<AgenteEvento[]> {
    // Hard limit no use case — controller tambem aplica limite mas
    // garantimos aqui contra qualquer caller que pule a validacao.
    const limit = Math.min(filtros.limit ?? 100, 1000);
    return this.repo.listar({ ...filtros, limit });
  }
}
