import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import {
  OrigemContato,
  TabelaPreco,
  TipoPessoa,
} from '../../domain/entities/enums';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { normalizarTelefone } from '../utils/normalizadores';

export interface CriarClienteInput {
  // Cliente
  nome: string;
  nomeFantasia?: string | null;
  tipoPessoa?: TipoPessoa;
  tabelaPreco?: TabelaPreco;
  telefone1?: string | null;
  telefone2?: string | null;
  email?: string | null;

  // Perfil (sempre criado em TRIAGE_IN_PROGRESS para clientes novos)
  whatsapp: string; // obrigatorio: cliente novo chega por canal
  origemContato: OrigemContato; // obrigatorio: rastreio de funil
}

@Injectable()
export class CriarClienteUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async execute(input: CriarClienteInput): Promise<Cliente> {
    const whatsappNormalizado = normalizarTelefone(input.whatsapp);
    const whatsappHash = hashField(whatsappNormalizado);

    // Idempotencia: se ja existe cliente com esse whatsapp_hash, conflito.
    // (Quem quer o "ja existe? me devolve o atual" deve usar BuscarPorWhatsapp.)
    // Verificacao via tabela clientes_perfil porque whatsapp_hash mora la.
    const telefone1Hash = input.telefone1
      ? hashField(normalizarTelefone(input.telefone1))
      : null;
    const emailHash = input.email ? hashField(input.email) : null;

    if (telefone1Hash) {
      const duplicadoTel = await this.clienteRepo.buscarPorTelefone1Hash(telefone1Hash);
      if (duplicadoTel) {
        throw new ConflictException(
          `Ja existe cliente com esse telefone (id: ${duplicadoTel.id})`,
        );
      }
    }
    if (emailHash) {
      const duplicadoEmail = await this.clienteRepo.buscarPorEmailHash(emailHash);
      if (duplicadoEmail) {
        throw new ConflictException(
          `Ja existe cliente com esse email (id: ${duplicadoEmail.id})`,
        );
      }
    }

    const cliente = Cliente.create({
      nome: input.nome,
      nomeFantasia: input.nomeFantasia ?? null,
      tipoPessoa: input.tipoPessoa ?? 'fisica',
      tabelaPreco: input.tabelaPreco ?? 'varejo',
      telefone1: input.telefone1 ?? null,
      telefone1Hash,
      telefone2: input.telefone2 ?? null,
      email: input.email ?? null,
      emailHash,
      ativo: true,
    });

    // clienteId fica vazio nesse momento — o repo seta apos INSERT.
    const perfil = ClientePerfil.create({
      clienteId: '', // placeholder, sobrescrito no repositorio
      whatsapp: input.whatsapp,
      whatsappHash,
      origemContato: input.origemContato,
      estadoConversa: 'TRIAGE_IN_PROGRESS',
      estadoAtualizadoEm: new Date(),
    });

    return this.clienteRepo.criarComPerfil(cliente, perfil);
  }
}
