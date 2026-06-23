import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('roles')
export class RoleOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  chave: string;

  @Column({ type: 'varchar', length: 120 })
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
