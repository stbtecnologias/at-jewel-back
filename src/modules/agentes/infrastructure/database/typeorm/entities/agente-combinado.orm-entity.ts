import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('agente_combinados')
@Index(['agente', 'criadoEm'])
export class AgenteCombinadoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  agente: string;

  @Column({ type: 'text' })
  texto: string;

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @Column({ name: 'removido_por', type: 'uuid', nullable: true })
  removidoPor: string | null;

  /** `null` = ativo. A remocao e logica — ver a migracao 68. */
  @Column({ name: 'removido_em', type: 'timestamptz', nullable: true })
  removidoEm: Date | null;
}
