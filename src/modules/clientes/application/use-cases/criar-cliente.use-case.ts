import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import {
  OrigemContato,
  TabelaPreco,
  TipoPessoa,
} from '../../domain/entities/enums';
import {
  CLIENTE_PERFIL_REPOSITORY,
  CLIENTE_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { normalizarTelefone, variantesTelefone } from '../utils/normalizadores';

export interface CriarClienteInput {
  idErp?: string | null;
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
    @Inject(CLIENTE_PERFIL_REPOSITORY)
    private readonly perfilRepo: IClientePerfilRepository,
  ) {}

  async execute(input: CriarClienteInput): Promise<Cliente> {
    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao — imutavel.
    if (input.idErp) {
      const dupIdErp = await this.clienteRepo.buscarPorIdErp(input.idErp);
      if (dupIdErp) {
        throw new ConflictException(
          'Ja existe cliente com esse id do ERP: ' + dupIdErp.id,
        );
      }
    }

    // Sem WhatsApp o cliente nasce sem perfil — ver o comentario em
    // CriarClienteInput.
    const whatsappHash = input.whatsapp
      ? hashField(normalizarTelefone(input.whatsapp))
      : null;

    const telefone1Hash = input.telefone1
      ? hashField(normalizarTelefone(input.telefone1))
      : null;
    const emailHash = input.email ? hashField(input.email) : null;

    // NAO ha checagem de duplicidade por telefone ou e-mail — de proposito,
    // desde 20/08/2026 (migracao 36).
    //
    // Ate aqui as duas colunas eram UNIQUE e este bloco devolvia 409 antes de
    // o Postgres estourar. So que gente diferente compartilha numero e e-mail:
    // mae e filha, marido e mulher, o fixo da empresa no cadastro do dono, o
    // telefone da loja usado como placeholder. O ERP tem varios assim, e cada
    // um deles ficava DE FORA do CRM — a criacao falhava e o registro nunca
    // entrava.
    //
    // Telefone e e-mail sao dado de CONTATO, nao identidade. Quem identifica
    // tem UNIQUE proprio: `id_erp` e `codigo_erp` acima, e o
    // `clientes_perfil.whatsapp_hash` logo abaixo — este ultimo continua
    // unico porque mensagem que chega precisa resolver para UM cliente.

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

    // Idempotencia pelo WhatsApp. Diferente do telefone de cadastro, ESTE
    // continua unico: e por ele que a Anastasia decide de quem e a mensagem que
    // chegou, e dois clientes com o mesmo numero deixariam o roteamento sem
    // criterio. A restricao vive em clientes_perfil.whatsapp_hash.
    //
    // A checagem estava prometida em comentario desde o inicio e nunca tinha
    // sido escrita: duplicata de WhatsApp estourava como violacao crua do
    // Postgres, um 500 que nao diz o que aconteceu nem qual e o registro.
    // Quem quer "ja existe? me devolve o atual" usa GET /clientes/lookup.
    //
    // Todas as formas equivalentes (nono digito, DDI) pelo mesmo motivo do
    // lookup: o mesmo numero em outro formato e a mesma pessoa.
    if (input.whatsapp) {
      for (const variante of variantesTelefone(input.whatsapp)) {
        const perfilExistente = await this.perfilRepo.buscarPorWhatsappHash(
          hashField(variante),
        );
        if (perfilExistente) {
          throw new ConflictException(
            `Ja existe cliente com esse whatsapp (id: ${perfilExistente.clienteId})`,
          );
        }
      }
    }

    const cliente = Cliente.create({
      idErp: input.idErp ?? null,
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
