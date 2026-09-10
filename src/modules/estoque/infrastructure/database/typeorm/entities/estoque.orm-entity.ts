import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Espelha a tabela criada na migracao 32 e reduzida pela 57. Sem PII, sem
 * coluna cifrada.
 *
 * A 57 apagou `fornecedor_id`, `cliente_id` e `vendedora_id` — o saldo passou
 * a morar sempre num local nosso —, e com elas foram as GENERATED `local_tipo`
 * e `local_id`, que so existiam para a UNIQUE composta pegar. Ver a entidade
 * de dominio para o que isso custou.
 */
@Entity('estoque')
export class EstoqueOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'id_erp',
    type: 'varchar',
    length: 50,
    unique: true,
    nullable: true,
  })
  idErp: string | null;

  @Column({
    name: 'codigo_erp',
    type: 'varchar',
    length: 50,
    unique: true,
    nullable: true,
  })
  codigoErp: string | null;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @Column({ name: 'grupo_estoque_id', type: 'uuid' })
  grupoEstoqueId: string;

  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  // NOT NULL desde a 57: e o unico campo que diz onde a peca esta.
  @Column({ name: 'local_estoque_id', type: 'uuid' })
  localEstoqueId: string;

  // Negativo e estado valido — ver partida dobrada na entidade de dominio.
  @Column({ type: 'integer', default: 0 })
  quantidade: number;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
