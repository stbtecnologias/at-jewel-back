import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type { AdminRole } from '../../../../domain/entities/admin-user.entity';

@Entity('admin_users')
export class AdminUserOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nome: string | null;

  // Migracao 37. Cifrado em repouso; o `telefone_hash` e o que da para buscar.
  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  telefone: string | null;

  @Column({
    name: 'telefone_hash',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  telefoneHash: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64, nullable: true })
  refreshTokenHash: string | null;

  @Column({ name: 'refresh_token_expires_at', type: 'timestamptz', nullable: true })
  refreshTokenExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Papel dinamico (migration 21): varchar referenciando roles.chave.
  @Column({ type: 'varchar', length: 40, default: 'ADMIN' })
  role: AdminRole;
}
