import { Inject, Injectable } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroDemografico,
  IClienteRepository,
  TierCliente,
} from '../../domain/ports/repositories/cliente-repository.port';

@Injectable()
export class DistribuicaoTiersUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly repo: IClienteRepository,
  ) {}

  execute(filtro?: FiltroDemografico): Promise<TierCliente[]> {
    return this.repo.distribuicaoTiers(filtro);
  }
}
