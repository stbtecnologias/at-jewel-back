import { AdminRole, AdminUser } from '../../entities/admin-user.entity';

export interface CriarUsuarioInput {
  email: string;
  nome: string | null;
  role: AdminRole;
  passwordHash: string | null; // null = usuario "so Google" (sem login por senha)
}

export interface IAdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  create(email: string, passwordHash: string): Promise<AdminUser>;
  /** Lista todos os usuarios. */
  listarTodos(): Promise<AdminUser[]>;
  /** Cria um usuario com papel/nome e senha opcional. */
  criarUsuario(input: CriarUsuarioInput): Promise<AdminUser>;
  /** Remove um usuario por id. */
  remover(id: string): Promise<void>;
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
