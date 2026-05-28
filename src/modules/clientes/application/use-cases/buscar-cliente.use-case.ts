import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cliente } from '../../domain/entities/cliente.entity';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';

@Injectable()
export class BuscarClienteUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async execute(id: string): Promise<Cliente> {
    const cliente = await this.clienteRepo.buscarPorId(id, { incluirPerfil: true });
    if (!cliente) {
      throw new NotFoundException(`Cliente ${id} nao encontrado`);
    }
    return cliente;
  }
}
