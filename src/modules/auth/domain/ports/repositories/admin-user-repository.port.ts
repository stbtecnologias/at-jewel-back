import { AdminUser } from '../../entities/admin-user.entity';

export interface IAdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  create(email: string, passwordHash: string): Promise<AdminUser>;
  /**
   * Atualiza o hash do refresh token corrente e o timestamp de expiracao.
   * Passar `null` em ambos invalida a sessao (logout, revogacao).
   */
  updateRefreshToken(
    id: string,
    hash: string | null,
    expiresAt: Date | null,
  ): Promise<void>;
  atualizarNome(id: string, nome: string): Promise<void>;
  atualizarSenha(id: string, passwordHash: string): Promise<void>;
}
