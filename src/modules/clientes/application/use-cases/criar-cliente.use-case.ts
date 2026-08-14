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
  codigoErp?: string | null;
  nome: string;
  nomeFantasia?: string | null;
  tipoPessoa?: TipoPessoa;
  tabelaPreco?: TabelaPreco;
  telefone1?: string | null;
  telefone2?: string | null;
  email?: string | null;

  /**
   * Perfil — OPCIONAIS desde 12/08/2026.
   *
   * Eram obrigatorios porque a rota nasceu para o fluxo da Anastasia: cliente
   * novo aparece mandando mensagem, entao sempre tinha WhatsApp e origem. Com a
   * integracao do ERP Safira passa a chegar cliente que nunca conversou — e
   * muitos nem CPF tem, como o Alessandro relatou na reuniao de 11/08.
   *
   * Sem WhatsApp, NAO se cria perfil. Um perfil vazio nasceria com
   * `estado_conversa = 'TRIAGE_IN_PROGRESS'` (NOT NULL com default), ou seja,
   * o cliente importado ficaria pendurado no funil como "em triagem" sem nunca
   * ter falado com ninguem — sujando qualquer relatorio de funil. O perfil
   * nasce depois, quando a pessoa mandar mensagem: e o que ele representa.
   */
  whatsapp?: string | null;
  origemContato?: OrigemContato | null;
}

@Injectable()
export class CriarClienteUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async execute(input: CriarClienteInput): Promise<Cliente> {
    // Sem WhatsApp o cliente nasce sem perfil — ver o comentario em
    // CriarClienteInput.
    const whatsappHash = input.whatsapp
      ? hashField(normalizarTelefone(input.whatsapp))
      : null;

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

    // Mesma checagem de telefone e email, agora para o codigo do ERP. A coluna
    // ja e UNIQUE desde a migracao 03, entao sem isto a duplicata viria como
    // erro de banco (500 generico) em vez de 409 com o id do existente.
    //
    // Importa para a INGESTAO: sincronizacao que reenvia por timeout recebe uma
    // resposta que diz o que aconteceu e qual e o registro, em vez de um 500
    // que nao distingue "ja existe" de "quebrou".
    if (input.codigoErp) {
      const duplicadoErp = await this.clienteRepo.buscarPorCodigoErp(input.codigoErp);
      if (duplicadoErp) {
        throw new ConflictException(
          `Ja existe cliente com esse codigo ERP (id: ${duplicadoErp.id})`,
        );
      }
    }

    const cliente = Cliente.create({
      codigoErp: input.codigoErp ?? null,
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

    // Sem WhatsApp nao ha triagem, logo nao ha perfil.
    if (!input.whatsapp) {
      return this.clienteRepo.criar(cliente);
    }

    // clienteId fica vazio nesse momento — o repo seta apos INSERT.
    const perfil = ClientePerfil.create({
      clienteId: '', // placeholder, sobrescrito no repositorio
      whatsapp: input.whatsapp,
      whatsappHash,
      origemContato: input.origemContato ?? null,
      estadoConversa: 'TRIAGE_IN_PROGRESS',
      estadoAtualizadoEm: new Date(),
    });

    return this.clienteRepo.criarComPerfil(cliente, perfil);
  }
}
