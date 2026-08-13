import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TipoPessoa } from '../../../clientes/domain/entities/enums';
import { Fornecedor } from '../../domain/entities/fornecedor.entity';
import { FORNECEDOR_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFornecedorRepository } from '../../domain/ports/repositories/fornecedor-repository.port';
import { normalizarOpcional } from '../utils/normalizadores';

export interface AtualizarFornecedorInput {
  codigoErp?: string | null;
  nome?: string;
  nomeFantasia?: string | null;
  tipoPessoa?: TipoPessoa;
  cpfCnpj?: string | null;
  inscricaoEstadual?: string | null;
  telefone?: string | null;
  email?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}

@Injectable()
export class AtualizarFornecedorUseCase {
  constructor(
    @Inject(FORNECEDOR_REPOSITORY)
    private readonly repo: IFornecedorRepository,
  ) {}

  async execute(id: string, input: AtualizarFornecedorInput): Promise<Fornecedor> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Fornecedor ${id} nao encontrado`);

    // `undefined` = campo ausente no PATCH, mantem o atual.
    // `null` = pedido explicito de limpar.
    const codigoErp = input.codigoErp !== undefined ? input.codigoErp : atual.codigoErp;

    if (codigoErp && codigoErp !== atual.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(codigoErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `Ja existe fornecedor com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    const manter = <T>(novo: T | undefined, antigo: T): T =>
      novo !== undefined ? novo : antigo;

    const atualizado = Fornecedor.create({
      id: atual.id,
      codigoErp,
      nome: input.nome ?? atual.nome,
      nomeFantasia: manter(input.nomeFantasia, atual.nomeFantasia),
      tipoPessoa: input.tipoPessoa ?? atual.tipoPessoa,
      cpfCnpj:
        input.cpfCnpj !== undefined ? normalizarOpcional(input.cpfCnpj) : atual.cpfCnpj,
      inscricaoEstadual: manter(input.inscricaoEstadual, atual.inscricaoEstadual),
      telefone:
        input.telefone !== undefined ? normalizarOpcional(input.telefone) : atual.telefone,
      email: manter(input.email, atual.email),
      logradouro: manter(input.logradouro, atual.logradouro),
      numero: manter(input.numero, atual.numero),
      complemento: manter(input.complemento, atual.complemento),
      bairro: manter(input.bairro, atual.bairro),
      cidade: manter(input.cidade, atual.cidade),
      estado:
        input.estado !== undefined
          ? input.estado
            ? input.estado.toUpperCase()
            : null
          : atual.estado,
      cep: input.cep !== undefined ? normalizarOpcional(input.cep) : atual.cep,
      observacao: manter(input.observacao, atual.observacao),
      ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
      criadoEm: atual.criadoEm,
      atualizadoEm: new Date(),
    });

    return this.repo.atualizar(atualizado);
  }
}
