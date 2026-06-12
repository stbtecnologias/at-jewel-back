import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TipoDefeito } from '../../../../domain/entities/enums';

@Entity('defeitos_devolucoes')
export class DefeitoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['DEFEITO', 'DEVOLUCAO', 'RECLAMACAO'],
    enumName: 'tipo_defeito',
  })
  tipo: TipoDefeito;

  @Column({ type: 'text' })
  descricao: string;

  @Index()
  @Column({ type: 'timestamptz' })
  data: Date;

  @Column({ type: 'text', nullable: true })
  resolucao: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
