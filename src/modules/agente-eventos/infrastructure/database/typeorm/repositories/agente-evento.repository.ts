import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgenteEvento } from '../../../../domain/entities/agente-evento.entity';
import {
  FiltroAgenteEvento,
  IAgenteEventoRepository,
} from '../../../../domain/ports/repositories/agente-evento-repository.port';
import { AgenteEventoOrmEntity } from '../entities/agente-evento.orm-entity';

@Injectable()
export class AgenteEventoRepository implements IAgenteEventoRepository {
  constructor(
    @InjectRepository(AgenteEventoOrmEntity)
    private readonly repo: Repository<AgenteEventoOrmEntity>,
  ) {}

  async registrar(evento: AgenteEvento): Promise<AgenteEvento> {
    const row = this.repo.create({
      agente: evento.agente,
      tipoEvento: evento.tipoEvento,
      clienteId: evento.clienteId,
      vendedoraId: evento.vendedoraId,
      correlationId: evento.correlationId,
      payload: evento.payload,
      criadoPorApiKeyId: evento.criadoPorApiKeyId,
    });
    const saved = await this.repo.save(row);
    return this.toDomain(saved);
  }

  async listar(filtros: FiltroAgenteEvento): Promise<AgenteEvento[]> {
    const qb = this.repo.createQueryBuilder('e');

    if (filtros.agente !== undefined) qb.andWhere('e.agente = :agente', { agente: filtros.agente });
    if (filtros.tipoEvento !== undefined) {
      qb.andWhere('e.tipo_evento = :tipo', { tipo: filtros.tipoEvento });
    }
    if (filtros.clienteId !== undefined) qb.andWhere('e.cliente_id = :cId', { cId: filtros.clienteId });
    if (filtros.vendedoraId !== undefined) {
      qb.andWhere('e.vendedora_id = :vId', { vId: filtros.vendedoraId });
    }
    if (filtros.correlationId !== undefined) {
      qb.andWhere('e.correlation_id = :corrId', { corrId: filtros.correlationId });
    }
    if (filtros.desde !== undefined) {
      qb.andWhere('e.criado_em >= :desde', { desde: filtros.desde });
    }

    qb.orderBy('e.criado_em', 'DESC');
    qb.limit(filtros.limit ?? 100);

    const rows = await qb.getMany();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: AgenteEventoOrmEntity): AgenteEvento {
    return AgenteEvento.create({
      // Postgres BIGINT vem como string no driver pg — converter.
      id: typeof row.id === 'string' ? Number(row.id) : row.id,
      agente: row.agente,
      tipoEvento: row.tipoEvento,
      clienteId: row.clienteId,
      vendedoraId: row.vendedoraId,
      correlationId: row.correlationId,
      payload: row.payload,
      criadoPorApiKeyId: row.criadoPorApiKeyId,
      criadoEm: row.criadoEm,
    });
  }
}
