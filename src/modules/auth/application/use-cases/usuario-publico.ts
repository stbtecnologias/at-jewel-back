import { AdminRole, AdminUser } from '../../domain/entities/admin-user.entity';

// Visao publica de um usuario — nunca expoe hash de senha/refresh.
export interface UsuarioPublico {
  id: string;
  email: string;
  nome: string | null;
  role: AdminRole;
  temSenha: boolean; // false = usuario "so Google"
  createdAt: string;
}

export function toUsuarioPublico(u: AdminUser): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nome: u.nome,
    role: u.role,
    temSenha: !!u.passwordHash,
    createdAt: u.createdAt.toISOString(),
  };
}
