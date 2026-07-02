import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  CanalDemanda,
  StatusDemanda,
  TipoDemanda,
} from '../../../../domain/entities/enums';

@Entity('demandas')
export class DemandaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'solicitante_user_id', type: 'uuid', nullable: true })
  solicitanteUserId: string | null;

  @Column({ name: 'solicitante_nome', type: 'text' })
  solicitanteNome: string;

  @Column({ type: 'text', default: 'MANUAL' })
  canal: CanalDemanda;

  @Index()
  @Column({ type: 'text' })
  tipo: TipoDemanda;

  @Column({ type: 'text' })
  descricao: string;

  @Index()
  @Column({ type: 'text', default: 'ABERTA' })
  status: StatusDemanda;

  @Column({ type: 'text', nullable: true })
  resposta: string | null;

  @Column({ name: 'concluida_em', type: 'timestamptz', nullable: true })
  concluidaEm: Date | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
