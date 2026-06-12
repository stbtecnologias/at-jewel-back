import type { TipoMeta } from './enums';

export interface MetaProps {
  id?: string;
  tipo: TipoMeta;
  referenciaId?: string | null;
  valorAlvo: number;
  prazo: Date;
  descricao?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Meta {
  readonly id: string | undefined;
  readonly tipo: TipoMeta;
  readonly referenciaId: string | null;
  readonly valorAlvo: number;
  readonly prazo: Date;
  readonly descricao: string | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: MetaProps) {
    this.id = props.id;
    this.tipo = props.tipo;
    this.referenciaId = props.referenciaId ?? null;
    this.valorAlvo = props.valorAlvo;
    this.prazo = props.prazo;
    this.descricao = props.descricao ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: MetaProps): Meta {
    // Meta especifica exige referencia; GLOBAL nao deve ter.
    if (props.tipo !== 'GLOBAL' && !props.referenciaId) {
      throw new Error(`Meta do tipo ${props.tipo} exige referenciaId`);
    }
    return new Meta(props);
  }
}
