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

/**
 * Espelha `movimentacoes_pagamentos` da migracao 46.
 *
 * SEM UNIQUE NENHUM alem da PK: o ERP nao manda chave utilizavel para a linha
 * — `id_recf` repete e nao ha numero de parcela. Duas parcelas de valor igual
 * sao legitimas e indistinguiveis. Por isso a sincronizacao substitui o
 * agregado em vez de casar linha a linha.
 */
@Entity('movimentacoes_pagamentos')
export class MovimentacaoPagamentoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'movimentacao_id', type: 'uuid' })
  movimentacaoId: string;

  @ManyToOne(() => MovimentacaoOrmEntity, (m) => m.pagamentos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'movimentacao_id' })
  movimentacao: MovimentacaoOrmEntity;

  @Column({ name: 'id_erp', type: 'varchar', length: 50, nullable: true })
  idErp: string | null;

  @Column({ name: 'n_parcela', type: 'int', nullable: true })
  nParcela: number | null;

  @Column({ name: 'forma_pagamento_id', type: 'uuid', nullable: true })
  formaPagamentoId: string | null;

  @Column({
    name: 'forma_pagamento_id_erp',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  formaPagamentoIdErp: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: string;

  @Column({ name: 'debito_credito', type: 'char', length: 1, default: 'D' })
  debitoCredito: 'D' | 'C';

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
