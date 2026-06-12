import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { MensagemAgente } from '../../../../domain/entities/conversa.entity';
import type { NomeAgente } from '../../../../domain/entities/enums';

@Entity('conversas')
export class ConversaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  agente: NomeAgente;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  mensagens: MensagemAgente[];

  @Column({ type: 'jsonb', nullable: true })
  contexto: Record<string, unknown> | null;

  @Index()
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Column({ name: 'vendedora_id', type: 'uuid', nullable: true })
  vendedoraId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
