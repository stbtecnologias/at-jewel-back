import { NomeAgente } from './enums';

export interface AgenteEventoProps {
  id?: number;
  agente: NomeAgente;
  tipoEvento: string;
  clienteId?: string | null;
  vendedoraId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown> | null;
  criadoPorApiKeyId?: string | null;
  criadoEm?: Date;
}

export class AgenteEvento {
  readonly id: number | undefined;
  readonly agente: NomeAgente;
  readonly tipoEvento: string;
  readonly clienteId: string | null;
  readonly vendedoraId: string | null;
  readonly correlationId: string | null;
  readonly payload: Record<string, unknown> | null;
  readonly criadoPorApiKeyId: string | null;
  readonly criadoEm: Date | undefined;

  private constructor(props: AgenteEventoProps) {
    this.id = props.id;
    this.agente = props.agente;
    this.tipoEvento = props.tipoEvento;
    this.clienteId = props.clienteId ?? null;
    this.vendedoraId = props.vendedoraId ?? null;
    this.correlationId = props.correlationId ?? null;
    this.payload = props.payload ?? null;
    this.criadoPorApiKeyId = props.criadoPorApiKeyId ?? null;
    this.criadoEm = props.criadoEm;
  }

  static create(props: AgenteEventoProps): AgenteEvento {
    return new AgenteEvento(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      agente: this.agente,
      tipoEvento: this.tipoEvento,
      clienteId: this.clienteId,
      vendedoraId: this.vendedoraId,
      correlationId: this.correlationId,
      payload: this.payload,
      criadoEm: this.criadoEm,
    };
  }
}
