import { Inject, Injectable } from '@nestjs/common';
import { Cliente } from '../../domain/entities/cliente.entity';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroCliente,
  IClienteRepository,
} from '../../domain/ports/repositories/cliente-repository.port';

@Injectable()
export class ListarClientesUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
  ) {}

  /**
   * Lista clientes com filtros opcionais. NAO carrega perfil — para o detalhe
   * com perfil, o consumidor deve chamar `buscarPorId`.
   */
  async execute(filtros: FiltroCliente): Promise<Cliente[]> {
    return this.clienteRepo.listar(filtros);
  }
}
