import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type {
  StatusDisponibilidadeVendedora,
  TipoVendedora,
} from '../../../../domain/entities/enums';

@Entity('vendedoras')
export class VendedoraOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo_erp', type: 'varchar', length: 50, unique: true, nullable: true })
  codigoErp: string | null;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'enum', enum: ['LOCAL', 'EXTERNA', 'GERENTE'], default: 'LOCAL' })
  tipo: TipoVendedora;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({
    name: 'status_disponibilidade',
    type: 'enum',
    enum: ['DISPONIVEL', 'OCUPADA', 'AUSENTE', 'FERIAS'],
    default: 'DISPONIVEL',
  })
  statusDisponibilidade: StatusDisponibilidadeVendedora;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  especialidades: string[];

  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  email: string | null;

  @Column({ name: 'email_hash', type: 'varchar', length: 64, unique: true, nullable: true })
  emailHash: string | null;

  @Column({
    name: 'whatsapp_interno',
    type: 'text',
    nullable: true,
    transformer: encryptedTransformer,
  })
  whatsappInterno: string | null;

  @Column({
    name: 'whatsapp_interno_hash',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  whatsappInternoHash: string | null;

  @Column({ name: 'admin_user_id', type: 'uuid', nullable: true })
  adminUserId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
