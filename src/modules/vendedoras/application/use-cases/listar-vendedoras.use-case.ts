import { Inject, Injectable } from '@nestjs/common';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroVendedora,
  IVendedoraRepository,
} from '../../domain/ports/repositories/vendedora-repository.port';

@Injectable()
export class ListarVendedorasUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(filtros: FiltroVendedora): Promise<Vendedora[]> {
    return this.repo.listar(filtros);
  }
}
