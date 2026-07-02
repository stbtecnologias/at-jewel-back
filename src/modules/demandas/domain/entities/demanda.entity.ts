import type { CanalDemanda, StatusDemanda, TipoDemanda } from './enums';

export interface DemandaProps {
  id?: string;
  solicitanteUserId?: string | null;
  solicitanteNome: string;
  canal?: CanalDemanda;
  tipo: TipoDemanda;
  descricao: string;
  status?: StatusDemanda;
  resposta?: string | null;
  concluidaEm?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// Entidade de dominio pura (sem TypeORM/NestJS). Concentra as
// invariantes da demanda: precisa de um solicitante identificado
// (nome), de uma descricao nao vazia e nasce ABERTA no canal MANUAL.
export class Demanda {
  readonly id: string | undefined;
  readonly solicitanteUserId: string | null;
  readonly solicitanteNome: string;
  readonly canal: CanalDemanda;
  readonly tipo: TipoDemanda;
  readonly descricao: string;
  readonly status: StatusDemanda;
  readonly resposta: string | null;
  readonly concluidaEm: Date | null;
  readonly createdAt: Date | undefined;
  readonly updatedAt: Date | undefined;

  private constructor(props: DemandaProps) {
    this.id = props.id;
    this.solicitanteUserId = props.solicitanteUserId ?? null;
    this.solicitanteNome = props.solicitanteNome;
    this.canal = props.canal ?? 'MANUAL';
    this.tipo = props.tipo;
    this.descricao = props.descricao;
    this.status = props.status ?? 'ABERTA';
    this.resposta = props.resposta ?? null;
    this.concluidaEm = props.concluidaEm ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: DemandaProps): Demanda {
    const nome = props.solicitanteNome?.trim();
    if (!nome) {
      throw new Error('Demanda exige solicitanteNome');
    }
    const descricao = props.descricao?.trim();
    if (!descricao) {
      throw new Error('Demanda exige descricao');
    }
    return new Demanda({ ...props, solicitanteNome: nome, descricao });
  }
}
