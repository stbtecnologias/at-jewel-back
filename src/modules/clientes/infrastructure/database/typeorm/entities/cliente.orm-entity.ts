import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type { TabelaPreco, TipoPessoa } from '../../../../domain/entities/enums';
import { ClientePerfilOrmEntity } from './cliente-perfil.orm-entity';

@Entity('clientes')
export class ClienteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo_erp', type: 'varchar', length: 50, unique: true, nullable: true })
  codigoErp: string | null;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 255, nullable: true })
  nomeFantasia: string | null;

  @Column({ name: 'tipo_pessoa', type: 'enum', enum: ['fisica', 'juridica'], default: 'fisica' })
  tipoPessoa: TipoPessoa;

  @Column({
    name: 'tabela_preco',
    type: 'enum',
    enum: ['varejo', 'atacado', 'especial', 'funcionario'],
    default: 'varejo',
  })
  tabelaPreco: TabelaPreco;

  @Column({ name: 'telefone_1', type: 'text', nullable: true, transformer: encryptedTransformer })
  telefone1: string | null;

  @Column({ name: 'telefone_1_hash', type: 'varchar', length: 64, unique: true, nullable: true })
  telefone1Hash: string | null;

  @Column({ name: 'telefone_2', type: 'text', nullable: true, transformer: encryptedTransformer })
  telefone2: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  email: string | null;

  @Column({ name: 'email_hash', type: 'varchar', length: 64, unique: true, nullable: true })
  emailHash: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ name: 'limite_credito', type: 'decimal', precision: 15, scale: 2, nullable: true })
  limiteCredito: number | null;

  @Column({
    name: 'observacao_geral',
    type: 'text',
    nullable: true,
    transformer: encryptedTransformer,
  })
  observacaoGeral: string | null;

  @Column({
    name: 'observacao_credito',
    type: 'text',
    nullable: true,
    transformer: encryptedTransformer,
  })
  observacaoCredito: string | null;

  @Column({ name: 'vendedora_codigo_erp', type: 'varchar', length: 50, nullable: true })
  vendedoraCodigoErp: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  // Relacao 1:0..1 com perfil. eager: false para nao carregar sem necessidade.
  // O repositorio decide quando incluir via `relations: ['perfil']`.
  @OneToOne(() => ClientePerfilOrmEntity, (perfil) => perfil.cliente)
  perfil: ClientePerfilOrmEntity | null;
}
