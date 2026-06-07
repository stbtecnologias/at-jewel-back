import { StatusDisponibilidadeVendedora, TipoVendedora } from './enums';

export interface VendedoraProps {
  id?: string;
  codigoErp?: string | null;
  nome: string;
  tipo: TipoVendedora;
  ativo: boolean;
  statusDisponibilidade: StatusDisponibilidadeVendedora;
  especialidades?: string[];
  email?: string | null;
  emailHash?: string | null;
  whatsappInterno?: string | null;
  whatsappInternoHash?: string | null;
  adminUserId?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Vendedora {
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly tipo: TipoVendedora;
  readonly ativo: boolean;
  readonly statusDisponibilidade: StatusDisponibilidadeVendedora;
  readonly especialidades: string[];

  // Descriptografados pela camada de infraestrutura. Hashes so para lookup.
  readonly email: string | null;
  readonly emailHash: string | null;
  readonly whatsappInterno: string | null;
  readonly whatsappInternoHash: string | null;

  readonly adminUserId: string | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: VendedoraProps) {
    this.id = props.id;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.tipo = props.tipo;
    this.ativo = props.ativo;
    this.statusDisponibilidade = props.statusDisponibilidade;
    this.especialidades = props.especialidades ?? [];
    this.email = props.email ?? null;
    this.emailHash = props.emailHash ?? null;
    this.whatsappInterno = props.whatsappInterno ?? null;
    this.whatsappInternoHash = props.whatsappInternoHash ?? null;
    this.adminUserId = props.adminUserId ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: VendedoraProps): Vendedora {
    return new Vendedora(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      codigoErp: this.codigoErp,
      nome: this.nome,
      tipo: this.tipo,
      ativo: this.ativo,
      statusDisponibilidade: this.statusDisponibilidade,
      especialidades: this.especialidades,
      email: this.email,
      whatsappInterno: this.whatsappInterno,
      adminUserId: this.adminUserId,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }

  // Serializacao reduzida para o agente (n8n) no passo de roteamento.
  // Expoe APENAS os campos necessarios ao algoritmo de match. Nao inclui
  // PII de contato interno (email/whatsappInterno) nem vinculo de identidade
  // (id/adminUserId), respeitando minimizacao de dados (LGPD Art. 6 III).
  toAgentePublic(): Record<string, unknown> {
    return {
      codigoErp: this.codigoErp,
      nome: this.nome,
      tipo: this.tipo,
      especialidades: this.especialidades,
      statusDisponibilidade: this.statusDisponibilidade,
    };
  }
}
