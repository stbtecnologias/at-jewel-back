import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cliente } from '../../domain/entities/cliente.entity';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Quem integra com o Safira conhece o id de la, nunca o UUID que geramos aqui —
 * sem esta busca a unica saida seria listar tudo e filtrar no cliente. O
 * `buscarPorIdErp` ja existia no repositorio desde 18/08, usado so para
 * detectar duplicata no POST/PATCH; aqui ele vira consulta.
 */
@Injectable()
export class BuscarClientePorIdErpUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly repo: IClienteRepository,
  ) {}

  async execute(idErp: string): Promise<Cliente> {
    const registro = await this.repo.buscarPorIdErp(idErp, { incluirPerfil: true });
    if (!registro) {
      throw new NotFoundException(`Cliente com id_erp ${idErp} nao encontrado`);
    }
    return registro;
  }
}
