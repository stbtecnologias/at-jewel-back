import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TipoMeta } from '../../../../domain/entities/enums';

@Entity('metas')
export class MetaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['GLOBAL', 'POR_PRODUTO', 'POR_VENDEDORA', 'POR_CLIENTE'],
    enumName: 'tipo_meta',
  })
  tipo: TipoMeta;

  @Index()
  @Column({ name: 'referencia_id', type: 'uuid', nullable: true })
  referenciaId: string | null;

  @Column({ name: 'valor_alvo', type: 'decimal', precision: 15, scale: 2 })
  valorAlvo: string;

  @Index()
  @Column({ type: 'timestamptz' })
  prazo: Date;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
