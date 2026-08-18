import { Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import {
  CLIENTE_PERFIL_REPOSITORY,
  CLIENTE_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { variantesTelefone } from '../utils/normalizadores';

@Injectable()
export class BuscarClientePorWhatsappUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
    @Inject(CLIENTE_PERFIL_REPOSITORY)
    private readonly perfilRepo: IClientePerfilRepository,
  ) {}

  /**
   * Recebe o numero em plaintext (com ou sem formatacao) e devolve o cliente
   * com perfil carregado, ou null se for numero desconhecido.
   *
   * Lookup principal da Anastasia ao receber mensagem no WhatsApp — e o passo
   * que decide entre CONTINUAR uma conversa e CRIAR um lead. Por isso tenta
   * todas as formas equivalentes do numero (nono digito, DDI): um falso
   * negativo aqui nao da erro, ele cria um cliente duplicado em silencio.
   *
   * Sao no maximo 4 consultas por hash indexado, e a forma recebida vem
   * primeiro — no caso comum resolve na primeira.
   */
  async execute(whatsapp: string): Promise<Cliente | null> {
    for (const variante of variantesTelefone(whatsapp)) {
      const perfil = await this.perfilRepo.buscarPorWhatsappHash(hashField(variante));
      if (perfil) {
        return this.clienteRepo.buscarPorId(perfil.clienteId, { incluirPerfil: true });
      }
    }
    return null;
  }
}
