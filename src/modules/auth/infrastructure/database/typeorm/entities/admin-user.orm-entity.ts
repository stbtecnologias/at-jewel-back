import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { AdminRole } from '../../../../domain/entities/admin-user.entity';

@Entity('admin_users')
export class AdminUserOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nome: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64, nullable: true })
  refreshTokenHash: string | null;

  @Column({ name: 'refresh_token_expires_at', type: 'timestamptz', nullable: true })
  refreshTokenExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'enum', enum: ['ADMIN', 'GERENTE', 'VENDEDORA'], default: 'ADMIN' })
  role: AdminRole;
}
