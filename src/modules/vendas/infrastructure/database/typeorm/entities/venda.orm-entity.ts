import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { StatusVenda } from '../../../../domain/entities/enums';
import { ItemVendaOrmEntity } from './item-venda.orm-entity';
import { PagamentoVendaOrmEntity } from './pagamento-venda.orm-entity';

@Entity('vendas')
export class VendaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo_erp', type: 'varchar', length: 50, unique: true, nullable: true })
  codigoErp: string | null;

  @Index()
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Index()
  @Column({ name: 'vendedora_id', type: 'uuid', nullable: true })
  vendedoraId: string | null;

  @Index()
  @Column({ name: 'data_venda', type: 'timestamptz' })
  dataVenda: Date;

  @Column({ name: 'data_contato', type: 'timestamptz', nullable: true })
  dataContato: Date | null;

  @Column({ name: 'valor_bruto', type: 'decimal', precision: 15, scale: 2 })
  valorBruto: string;

  @Column({ name: 'valor_desconto', type: 'decimal', precision: 15, scale: 2, default: 0 })
  valorDesconto: string;

  @Column({ name: 'valor_total', type: 'decimal', precision: 15, scale: 2 })
  valorTotal: string;

  @Column({
    type: 'enum',
    enum: ['concluida', 'cancelada', 'pendente'],
    default: 'concluida',
  })
  status: StatusVenda;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @OneToMany(() => ItemVendaOrmEntity, (item) => item.venda, { cascade: false })
  itens: ItemVendaOrmEntity[];

  @OneToMany(() => PagamentoVendaOrmEntity, (pag) => pag.venda, { cascade: false })
  pagamentos: PagamentoVendaOrmEntity[];
}
