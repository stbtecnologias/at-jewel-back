import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import { TabelaPreco, TipoPessoa } from '../../domain/entities/enums';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { normalizarTelefone } from '../utils/normalizadores';

/**
 * Atualiza o CADASTRO do cliente — os dados operacionais/ERP da tabela
 * `clientes`.
 *
 * Nao confundir com AtualizarPerfilClienteUseCase, que mexe em
 * `clientes_perfil`: aquilo e o que a Anastasia coletou na triagem (intencao
 * de compra, wishlist, estado da conversa). Sao duas tabelas com donos
 * diferentes, e essa separacao e proposital — ver o cabecalho da migracao 03.
 *
 * Ate 12/08/2026 nao existia rota para isso: havia POST /clientes e
 * PATCH /clientes/:id/perfil, e o cadastro em si nao tinha update.
 */
export interface AtualizarClienteInput {
  codigoErp?: string | null;
  nome?: string;
  nomeFantasia?: string | null;
  tipoPessoa?: TipoPessoa;
  tabelaPreco?: TabelaPreco;
  // Em plaintext — o use case recalcula o hash se mudar.
  telefone1?: string | null;
  telefone2?: string | null;
  email?: string | null;
  ativo?: boolean;
  limiteCredito?: number | null;
  observacaoGeral?: string | null;
  observacaoCredito?: string | null;
  vendedoraCodigoErp?: string | null;
}

@Injectable()
export class AtualizarClienteUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly repo: IClienteRepository,
  ) {}

  async execute(id: string, input: AtualizarClienteInput): Promise<Cliente> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Cliente ${id} nao encontrado`);

    // `undefined` = campo ausente no PATCH, mantem o valor atual.
    // `null` = pedido explicito de limpar o campo. Os dois casos precisam de
    // tratamento distinto no hash, senao limpar o telefone deixaria o hash
    // antigo orfao e o lookup continuaria encontrando o cliente.
    const telefoneMudou =
      input.telefone1 !== undefined && input.telefone1 !== atual.telefone1;
    const emailMudou = input.email !== undefined && input.email !== atual.email;

    const telefone1 = input.telefone1 !== undefined ? input.telefone1 : atual.telefone1;
    const email = input.email !== undefined ? input.email : atual.email;

    const telefone1Hash = telefoneMudou
      ? telefone1
        ? hashField(normalizarTelefone(telefone1))
        : null
      : atual.telefone1Hash;

    const emailHash = emailMudou ? (email ? hashField(email) : null) : atual.emailHash;

    // As colunas de hash sao UNIQUE. Checar antes devolve 409 com mensagem
    // util, em vez de deixar estourar violacao crua do Postgres como 500.
    if (telefoneMudou && telefone1Hash) {
      const dup = await this.repo.buscarPorTelefone1Hash(telefone1Hash);
      if (dup && dup.id !== id) {
        throw new ConflictException(`Ja existe cliente com esse telefone (id: ${dup.id})`);
      }
    }
    if (emailMudou && emailHash) {
      const dup = await this.repo.buscarPorEmailHash(emailHash);
      if (dup && dup.id !== id) {
        throw new ConflictException(`Ja existe cliente com esse email (id: ${dup.id})`);
      }
    }

    const atualizado = Cliente.create({
      id: atual.id,
      codigoErp: input.codigoErp !== undefined ? input.codigoErp : atual.codigoErp,
      nome: input.nome ?? atual.nome,
      nomeFantasia:
        input.nomeFantasia !== undefined ? input.nomeFantasia : atual.nomeFantasia,
      tipoPessoa: input.tipoPessoa ?? atual.tipoPessoa,
      tabelaPreco: input.tabelaPreco ?? atual.tabelaPreco,
      telefone1,
      telefone1Hash,
      telefone2: input.telefone2 !== undefined ? input.telefone2 : atual.telefone2,
      email,
      emailHash,
      ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
      limiteCredito:
        input.limiteCredito !== undefined ? input.limiteCredito : atual.limiteCredito,
      observacaoGeral:
        input.observacaoGeral !== undefined ? input.observacaoGeral : atual.observacaoGeral,
      observacaoCredito:
        input.observacaoCredito !== undefined
          ? input.observacaoCredito
          : atual.observacaoCredito,
      vendedoraCodigoErp:
        input.vendedoraCodigoErp !== undefined
          ? input.vendedoraCodigoErp
          : atual.vendedoraCodigoErp,
      criadoEm: atual.criadoEm,
      atualizadoEm: new Date(),
      perfil: atual.perfil,
    });

    return this.repo.atualizar(atualizado);
  }
}
