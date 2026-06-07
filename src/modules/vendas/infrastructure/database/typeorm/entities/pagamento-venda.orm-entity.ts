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
import type { FormaPagamento } from '../../../../domain/entities/enums';
import { VendaOrmEntity } from './venda.orm-entity';

@Entity('pagamentos_venda')
export class PagamentoVendaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'venda_id', type: 'uuid' })
  vendaId: string;

  @Column({
    name: 'forma_pagamento',
    type: 'enum',
    enum: [
      'dinheiro',
      'pix',
      'cartao_credito',
      'cartao_debito',
      'transferencia',
      'crediario',
      'cheque',
      'outro',
    ],
  })
  formaPagamento: FormaPagamento;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: string;

  @Column({ type: 'int', default: 1 })
  parcelas: number;

  @Column({ name: 'valor_parcela', type: 'decimal', precision: 15, scale: 2, nullable: true })
  valorParcela: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  bandeira: string | null;

  @Column({ name: 'data_pagamento', type: 'timestamptz', nullable: true })
  dataPagamento: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @ManyToOne(() => VendaOrmEntity, (venda) => venda.pagamentos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venda_id' })
  venda: VendaOrmEntity;
}
