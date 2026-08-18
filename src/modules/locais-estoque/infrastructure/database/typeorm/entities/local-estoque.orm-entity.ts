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
