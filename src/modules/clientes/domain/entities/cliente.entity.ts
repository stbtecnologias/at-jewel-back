import { ClientePerfil } from './cliente-perfil.entity';
import { TabelaPreco, TipoPessoa } from './enums';

export interface ClienteProps {
  id?: string;
  codigoErp?: string | null;
  nome: string;
  nomeFantasia?: string | null;
  tipoPessoa: TipoPessoa;
  tabelaPreco: TabelaPreco;
  telefone1?: string | null;
  telefone1Hash?: string | null;
  telefone2?: string | null;
  email?: string | null;
  emailHash?: string | null;
  ativo: boolean;
  limiteCredito?: number | null;
  observacaoGeral?: string | null;
  observacaoCredito?: string | null;
  vendedoraCodigoErp?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
  perfil?: ClientePerfil | null;
}

export class Cliente {
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly nomeFantasia: string | null;
  readonly tipoPessoa: TipoPessoa;
  readonly tabelaPreco: TabelaPreco;

  // Descriptografados pela camada de infraestrutura. Os hashes existem so
  // para lookup interno — NUNCA exposto em response DTO.
  readonly telefone1: string | null;
  readonly telefone1Hash: string | null;
  readonly telefone2: string | null;
  readonly email: string | null;
  readonly emailHash: string | null;

  readonly ativo: boolean;
  readonly limiteCredito: number | null;
  readonly observacaoGeral: string | null;
  readonly observacaoCredito: string | null;
  readonly vendedoraCodigoErp: string | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  // 1:0..1 — nem todo cliente passou pela triagem da Anastasia.
  readonly perfil: ClientePerfil | null;

  private constructor(props: ClienteProps) {
    this.id = props.id;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.nomeFantasia = props.nomeFantasia ?? null;
    this.tipoPessoa = props.tipoPessoa;
    this.tabelaPreco = props.tabelaPreco;
    this.telefone1 = props.telefone1 ?? null;
    this.telefone1Hash = props.telefone1Hash ?? null;
    this.telefone2 = props.telefone2 ?? null;
    this.email = props.email ?? null;
    this.emailHash = props.emailHash ?? null;
    this.ativo = props.ativo;
    this.limiteCredito = props.limiteCredito ?? null;
    this.observacaoGeral = props.observacaoGeral ?? null;
    this.observacaoCredito = props.observacaoCredito ?? null;
    this.vendedoraCodigoErp = props.vendedoraCodigoErp ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
    this.perfil = props.perfil ?? null;
  }

  static create(props: ClienteProps): Cliente {
    return new Cliente(props);
  }

  // Helper para a camada HTTP — produz objeto sem campos *_hash.
  // E sem campo `perfil` (que vai serializado separadamente se carregado).
  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      codigoErp: this.codigoErp,
      nome: this.nome,
      nomeFantasia: this.nomeFantasia,
      tipoPessoa: this.tipoPessoa,
      tabelaPreco: this.tabelaPreco,
      telefone1: this.telefone1,
      telefone2: this.telefone2,
      email: this.email,
      ativo: this.ativo,
      limiteCredito: this.limiteCredito,
      observacaoGeral: this.observacaoGeral,
      observacaoCredito: this.observacaoCredito,
      vendedoraCodigoErp: this.vendedoraCodigoErp,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
      perfil: this.perfil?.toPublic() ?? null,
    };
  }
}
