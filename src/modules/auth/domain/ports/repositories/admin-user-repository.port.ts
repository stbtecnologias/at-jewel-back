import { AdminUser } from '../../entities/admin-user.entity';

export interface IAdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  create(email: string, passwordHash: string): Promise<AdminUser>;
  updateRefreshToken(id: string, hash: string | null): Promise<void>;
}
