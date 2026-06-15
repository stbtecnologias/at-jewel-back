import { Inject, Injectable } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IClienteRepository,
  TierCliente,
} from '../../domain/ports/repositories/cliente-repository.port';

@Injectable()
export class DistribuicaoTiersUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly repo: IClienteRepository,
  ) {}

  execute(): Promise<TierCliente[]> {
    return this.repo.distribuicaoTiers();
  }
}
