import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { NomeAgente } from '../../../../domain/entities/enums';

@Entity('agente_eventos')
@Index(['agente', 'tipoEvento'])
export class AgenteEventoOrmEntity {
  // BIGSERIAL no banco — TypeORM gera 'increment' para tipo bigint.
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'enum', enum: ['anastasia', 'elena', 'sofia', 'sistema'] })
  agente: NomeAgente;

  @Column({ name: 'tipo_evento', type: 'varchar', length: 100 })
  tipoEvento: string;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Column({ name: 'vendedora_id', type: 'uuid', nullable: true })
  vendedoraId: string | null;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'criado_por_api_key_id', type: 'uuid', nullable: true })
  criadoPorApiKeyId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
