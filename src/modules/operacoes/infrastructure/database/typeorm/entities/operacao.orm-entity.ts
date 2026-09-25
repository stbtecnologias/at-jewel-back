import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OPERACAO_CLASSES } from '../../../../domain/entities/enums';
import type { OperacaoClasse } from '../../../../domain/entities/enums';

/**
 * Espelha a tabela criada na migracao 46. Nenhuma coluna cifrada — cadastro
 * estrutural, sem PII.
 */
@Entity('operacoes')
export class OperacaoOrmEntity {
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
   * Migracao 63. Sem UNIQUE de proposito: e o mesmo id de `id_erp` noutra
   * grafia, e um unico por cima dele rejeitaria duas operacoes diferentes que
   * por acaso chegassem sem zero.
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

  @Column({ type: 'varchar', length: 100 })
  nome: string;

  @Column({ type: 'enum', enum: OPERACAO_CLASSES, default: 'OUTRA' })
  classificacao: OperacaoClasse;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
