import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  DesfechoAtendimento,
  OcasiaoAtendimento,
} from '../../../../domain/entities/enums';
import { AtendimentoInteracaoOrmEntity } from './atendimento-interacao.orm-entity';

@Entity('atendimentos')
export class AtendimentoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  /**
   * Congelada na abertura. Remanejar a carteira depois — a regra dos 6 meses
   * da ata de 17/08 — nao pode reescrever quem atendeu na epoca.
   */
  @Index()
  @Column({ name: 'vendedora_id', type: 'uuid' })
  vendedoraId: string;

  @Column({ type: 'text', nullable: true })
  ocasiao: OcasiaoAtendimento | null;

  @Column({ name: 'aberto_em', type: 'timestamptz' })
  abertoEm: Date;

  @Column({ name: 'fechado_em', type: 'timestamptz', nullable: true })
  fechadoEm: Date | null;

  @Column({ type: 'text', nullable: true })
  desfecho: DesfechoAtendimento | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @OneToMany(() => AtendimentoInteracaoOrmEntity, (i) => i.atendimento)
  interacoes?: AtendimentoInteracaoOrmEntity[];
}
