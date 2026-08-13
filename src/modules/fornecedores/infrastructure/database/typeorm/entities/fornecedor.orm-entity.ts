import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type { TipoPessoa } from '../../../../../clientes/domain/entities/enums';

/**
 * Espelha a tabela criada na migracao 26. Ver o cabecalho daquele arquivo
 * para as decisoes de modelagem — em especial por que o endereco fica em
 * claro e por que nao ha coluna de hash do documento.
 */
@Entity('fornecedores')
export class FornecedorOrmEntity {
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

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 255, nullable: true })
  nomeFantasia: string | null;

  @Column({
    name: 'tipo_pessoa',
    type: 'enum',
    enum: ['fisica', 'juridica'],
    default: 'juridica',
  })
  tipoPessoa: TipoPessoa;

  // Cifrado. Gravado somente com digitos — o use case normaliza na entrada.
  @Column({ name: 'cpf_cnpj', type: 'text', nullable: true, transformer: encryptedTransformer })
  cpfCnpj: string | null;

  @Column({ name: 'inscricao_estadual', type: 'varchar', length: 30, nullable: true })
  inscricaoEstadual: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  telefone: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logradouro: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  numero: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  complemento: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bairro: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cidade: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  estado: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  cep: string | null;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
