import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MovimentacaoOrmEntity } from './movimentacao.orm-entity';

/** Espelha `movimentacoes_itens` da migracao 46. */
@Entity('movimentacoes_itens')
@Index(['movimentacaoId', 'nItem'], { unique: true })
export class MovimentacaoItemOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'movimentacao_id', type: 'uuid' })
  movimentacaoId: string;

  @ManyToOne(() => MovimentacaoOrmEntity, (m) => m.itens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'movimentacao_id' })
  movimentacao: MovimentacaoOrmEntity;

  @Column({ name: 'n_item', type: 'int' })
  nItem: number;

  // `id_mesti`. Atributo, NAO identidade — repete em todas as linhas do mesmo
  // documento. Sem unique, de proposito.
  @Column({ name: 'id_erp', type: 'varchar', length: 50, nullable: true })
  idErp: string | null;

  @Index()
  @Column({ name: 'produto_id', type: 'uuid', nullable: true })
  produtoId: string | null;

  @Column({ name: 'produto_id_erp', type: 'varchar', length: 50, nullable: true })
  produtoIdErp: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  quantidade: string;

  @Column({ name: 'valor_unitario', type: 'decimal', precision: 15, scale: 2 })
  valorUnitario: string;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
