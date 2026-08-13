import { TipoPessoa } from '../../../clientes/domain/entities/enums';

/**
 * Fornecedor — cadastro criado na migracao 26, a partir do levantamento da
 * integracao do ERP Safira (reuniao de 11/08/2026).
 *
 * Ate entao fornecedor nao existia como entidade: havia apenas
 * `produtos.referencia_fornecedor`, texto livre, por onde
 * /analytics/giro-estoque agrupa ate hoje — variacao de grafia vira fornecedor
 * distinto no relatorio.
 *
 * PII: `cpfCnpj`, `telefone` e `email` sao cifrados na coluna (AES-256-GCM,
 * mesmo transformer de clientes/vendedoras) e chegam aqui ja decifrados. O
 * endereco fica em claro por decisao consciente — permite analise regional de
 * compra sem decifrar a base.
 *
 * Reaproveita `TipoPessoa` do modulo de clientes: e o mesmo ENUM
 * `tipo_pessoa` no banco, criado na migracao 03. Duplicar o tipo criaria dois
 * nomes para a mesma coluna.
 */
export interface FornecedorProps {
  id?: string;
  codigoErp?: string | null;
  nome: string;
  nomeFantasia?: string | null;
  tipoPessoa: TipoPessoa;

  // Decifrados pela camada de infraestrutura. Gravados so com digitos.
  cpfCnpj?: string | null;
  telefone?: string | null;
  email?: string | null;

  inscricaoEstadual?: string | null;

  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;

  observacao?: string | null;
  ativo: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Fornecedor {
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly nomeFantasia: string | null;
  readonly tipoPessoa: TipoPessoa;

  readonly cpfCnpj: string | null;
  readonly telefone: string | null;
  readonly email: string | null;

  readonly inscricaoEstadual: string | null;

  readonly logradouro: string | null;
  readonly numero: string | null;
  readonly complemento: string | null;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly estado: string | null;
  readonly cep: string | null;

  readonly observacao: string | null;
  readonly ativo: boolean;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: FornecedorProps) {
    this.id = props.id;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.nomeFantasia = props.nomeFantasia ?? null;
    this.tipoPessoa = props.tipoPessoa;
    this.cpfCnpj = props.cpfCnpj ?? null;
    this.telefone = props.telefone ?? null;
    this.email = props.email ?? null;
    this.inscricaoEstadual = props.inscricaoEstadual ?? null;
    this.logradouro = props.logradouro ?? null;
    this.numero = props.numero ?? null;
    this.complemento = props.complemento ?? null;
    this.bairro = props.bairro ?? null;
    this.cidade = props.cidade ?? null;
    this.estado = props.estado ?? null;
    this.cep = props.cep ?? null;
    this.observacao = props.observacao ?? null;
    this.ativo = props.ativo;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: FornecedorProps): Fornecedor {
    return new Fornecedor(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      codigoErp: this.codigoErp,
      nome: this.nome,
      nomeFantasia: this.nomeFantasia,
      tipoPessoa: this.tipoPessoa,
      cpfCnpj: this.cpfCnpj,
      inscricaoEstadual: this.inscricaoEstadual,
      telefone: this.telefone,
      email: this.email,
      logradouro: this.logradouro,
      numero: this.numero,
      complemento: this.complemento,
      bairro: this.bairro,
      cidade: this.cidade,
      estado: this.estado,
      cep: this.cep,
      observacao: this.observacao,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
