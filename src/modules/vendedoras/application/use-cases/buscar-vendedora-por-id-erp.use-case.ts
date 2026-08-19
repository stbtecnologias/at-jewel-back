import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Quem integra com o Safira conhece o id de la, nunca o UUID que geramos aqui —
 * sem esta busca a unica saida seria listar tudo e filtrar no cliente. O
 * `buscarPorIdErp` ja existia no repositorio desde 18/08, usado so para
 * detectar duplicata no POST/PATCH; aqui ele vira consulta.
 */
@Injectable()
export class BuscarVendedoraPorIdErpUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(idErp: string): Promise<Vendedora> {
    const registro = await this.repo.buscarPorIdErp(idErp);
    if (!registro) {
      throw new NotFoundException(`Vendedora com id_erp ${idErp} nao encontrada`);
    }
    return registro;
  }
}
