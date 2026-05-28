import { Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import {
  CLIENTE_PERFIL_REPOSITORY,
  CLIENTE_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { normalizarTelefone } from '../utils/normalizadores';

@Injectable()
export class BuscarClientePorWhatsappUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
    @Inject(CLIENTE_PERFIL_REPOSITORY)
    private readonly perfilRepo: IClientePerfilRepository,
  ) {}

  /**
   * Recebe o numero em plaintext (com ou sem formatacao). Normaliza,
   * computa o hash e busca em `clientes_perfil`. Retorna o cliente
   * com perfil carregado, ou null se for numero desconhecido.
   *
   * Lookup principal da Anastasia ao receber mensagem no WhatsApp.
   */
  async execute(whatsapp: string): Promise<Cliente | null> {
    const hash = hashField(normalizarTelefone(whatsapp));
    const perfil = await this.perfilRepo.buscarPorWhatsappHash(hash);
    if (!perfil) return null;
    return this.clienteRepo.buscarPorId(perfil.clienteId, { incluirPerfil: true });
  }
}
