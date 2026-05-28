import { AgenteEvento } from '../../entities/agente-evento.entity';
import { NomeAgente } from '../../entities/enums';

export interface FiltroAgenteEvento {
  agente?: NomeAgente;
  tipoEvento?: string;
  clienteId?: string;
  vendedoraId?: string;
  correlationId?: string;
  /** ISO date string ou Date — eventos com criado_em >= desde. */
  desde?: Date;
  /** Limite de registros (default 100, max 1000 no controller). */
  limit?: number;
}

export interface IAgenteEventoRepository {
  registrar(evento: AgenteEvento): Promise<AgenteEvento>;
  listar(filtros: FiltroAgenteEvento): Promise<AgenteEvento[]>;
}
