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
  /**
   * A conta esta ligada? — migracao 77, 09/11/2026.
   *
   * SAI NA LISTA DE PROPOSITO, e e a unica excecao do "nao aparece em
   * consulta": a tela de Usuarios e o unico lugar de onde da para REATIVAR
   * alguem. Escondendo o desligado ali, a desativacao viraria irreversivel
   * pelo painel e o conserto seria UPDATE em producao.
   */
  ativo: boolean;
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
    ativo: u.ativo,
    createdAt: u.createdAt.toISOString(),
  };
}
