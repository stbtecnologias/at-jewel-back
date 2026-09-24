import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Espelha a tabela criada na migracao 32. Sem PII, sem coluna cifrada. */
@Entity('locais_estoque')
export class LocalEstoqueOrmEntity {
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

  /**
   * O id do ERP COMO O INTEGRADOR MANDOU — migracao 65.
   *
   * Sem UNIQUE e fora de toda busca: quem casa e `idErp`, normalizado. Esta
   * coluna serve so ao `idErpLocal` da resposta, para quem manda
   * "009000000018" nao receber "9000000018" de volta.
   */
  @Column({ name: 'id_erp_bruto', type: 'varchar', length: 50, nullable: true })
  idErpBruto: string | null;

  @Column({
    name: 'codigo_erp',
    type: 'varchar',
    length: 50,
    unique: true,
    nullable: true,
  })
  codigoErp: string | null;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
