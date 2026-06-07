import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Venda } from '../../domain/entities/venda.entity';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendaRepository } from '../../domain/ports/repositories/venda-repository.port';

@Injectable()
export class BuscarVendaUseCase {
  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  /**
   * Busca uma venda com o agregado completo (itens + pagamentos).
   */
  async execute(id: string): Promise<Venda> {
    const venda = await this.vendaRepo.buscarPorId(id, { incluirAgregado: true });
    if (!venda) {
      throw new NotFoundException('Venda nao encontrada');
    }
    return venda;
  }
}
