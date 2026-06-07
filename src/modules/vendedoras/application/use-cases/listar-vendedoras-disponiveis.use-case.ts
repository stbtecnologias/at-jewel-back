import { Inject, Injectable } from '@nestjs/common';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

/**
 * Lista vendedoras elegiveis para roteamento pelo agente (Anastasia/n8n).
 *
 * O filtro e FIXO nesta camada: somente vendedoras ativas e com status
 * DISPONIVEL. Isso garante que o endpoint exposto por API Key nao possa
 * ampliar o conjunto retornado via query string (diferente do listar
 * administrativo, que aceita filtros arbitrarios sob JWT).
 */
@Injectable()
export class ListarVendedorasDisponiveisUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(): Promise<Vendedora[]> {
    return this.repo.listar({
      ativo: true,
      statusDisponibilidade: 'DISPONIVEL',
    });
  }
}
