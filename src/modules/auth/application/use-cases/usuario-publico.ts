import { AdminRole, AdminUser } from '../../domain/entities/admin-user.entity';

// Visao publica de um usuario — nunca expoe hash de senha/refresh.
export interface UsuarioPublico {
  id: string;
  email: string;
  nome: string | null;
  role: AdminRole;
  temSenha: boolean; // false = usuario "so Google"
  /**
   * Celular em claro. E PII, e sai daqui de proposito: sem ver o numero nao ha
   * como conferir se o cadastro esta certo. A rota exige JWT de staff e
   * permissao de usuarios — nao e publica.
   */
  telefone: string | null;
  createdAt: string;
}

export function toUsuarioPublico(u: AdminUser): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nome: u.nome,
    role: u.role,
    temSenha: !!u.passwordHash,
    telefone: u.telefone,
    createdAt: u.createdAt.toISOString(),
  };
}
