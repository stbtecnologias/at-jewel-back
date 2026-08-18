import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Espelha a tabela criada na migracao 32. Sem PII, sem coluna cifrada.
 *
 * `local_tipo` e `local_id` sao GENERATED ALWAYS no banco: existem
 * para a UNIQUE composta funcionar (tres das quatro colunas de local
 * estao sempre nulas, e no Postgres nulos nunca colidem entre si). Aqui elas
 * sao `insert: false, update: false` — o TypeORM le, nunca escreve. Tentar
 * gravar devolveria erro do proprio Postgres.
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

  @Column({ name: 'local_estoque_id', type: 'uuid', nullable: true })
  localEstoqueId: string | null;

  @Column({ name: 'fornecedor_id', type: 'uuid', nullable: true })
  fornecedorId: string | null;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Column({ name: 'vendedora_id', type: 'uuid', nullable: true })
  vendedoraId: string | null;

  // Negativo e estado valido — ver partida dobrada na entidade de dominio.
  @Column({ type: 'integer', default: 0 })
  quantidade: number;

  @Column({
    name: 'local_tipo',
    type: 'text',
    insert: false,
    update: false,
  })
  localTipo: 'LOCAL' | 'FORNECEDOR' | 'CLIENTE' | 'VENDEDORA';

  @Column({ name: 'local_id', type: 'uuid', insert: false, update: false })
  localId: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
