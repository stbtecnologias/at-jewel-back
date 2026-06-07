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
import { VendaOrmEntity } from './venda.orm-entity';

@Entity('itens_venda')
export class ItemVendaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'venda_id', type: 'uuid' })
  vendaId: string;

  @Index()
  @Column({ name: 'produto_id', type: 'uuid', nullable: true })
  produtoId: string | null;

  @Column({ name: 'codigo_erp_item', type: 'varchar', length: 50, nullable: true })
  codigoErpItem: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  quantidade: string;

  @Column({ name: 'valor_unitario', type: 'decimal', precision: 15, scale: 2 })
  valorUnitario: string;

  @Column({
    name: 'valor_custo_unitario',
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  valorCustoUnitario: string | null;

  @Column({ name: 'valor_desconto_item', type: 'decimal', precision: 15, scale: 2, default: 0 })
  valorDescontoItem: string;

  @Column({ name: 'valor_total_item', type: 'decimal', precision: 15, scale: 2 })
  valorTotalItem: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @ManyToOne(() => VendaOrmEntity, (venda) => venda.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venda_id' })
  venda: VendaOrmEntity;
}
