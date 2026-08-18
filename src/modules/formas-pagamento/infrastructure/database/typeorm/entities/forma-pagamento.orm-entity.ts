import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FORMAS_PAGAMENTO } from '../../../../../vendas/domain/entities/enums';
import type { FormaPagamento as ClassificacaoPagamento } from '../../../../../vendas/domain/entities/enums';

/**
 * Espelha a tabela criada na migracao 28. Nenhuma coluna cifrada — cadastro
 * estrutural, sem PII.
 */
@Entity('formas_pagamento')
export class FormaPagamentoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'id_erp', type: 'varchar', length: 50, unique: true, nullable: true })
  idErp: string | null;

  @Column({
    name: 'codigo_erp',
    type: 'varchar',
    length: 50,
    unique: true,
    nullable: true,
  })
  codigoErp: string | null;

  @Column({ type: 'varchar', length: 100 })
  nome: string;

  // Reusa o ENUM `forma_pagamento` da migracao 09 — o mesmo tipo que
  // pagamentos_venda.forma_pagamento usa hoje.
  @Column({ type: 'enum', enum: FORMAS_PAGAMENTO })
  classificacao: ClassificacaoPagamento;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
