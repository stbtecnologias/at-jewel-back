import { AdminRole, AdminUser } from '../../entities/admin-user.entity';

export interface CriarUsuarioInput {
  email: string;
  nome: string | null;
  role: AdminRole;
  passwordHash: string | null; // null = usuario "so Google" (sem login por senha)
  /** Celular em claro; o repositorio cifra ao gravar. */
  telefone: string | null;
  /** HMAC do telefone so com digitos — e por ele que se busca. */
  telefoneHash: string | null;
}

export interface IAdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  /**
   * Acha pelo HMAC do telefone. Existe para barrar duplicata no cadastro, e e
   * o mesmo caminho que o canal interno vai usar quando o ADM entrar no
   * WhatsApp. Buscar pelo valor cifrado nao funciona: o mesmo numero gera
   * bytes diferentes a cada gravacao.
   */
  buscarPorTelefoneHash(hash: string): Promise<AdminUser | null>;
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
  /**
   * Atualiza os campos informados e devolve o usuario ja salvo.
   *
   * Campo AUSENTE do objeto nao e tocado; campo com `null` e apagado. A
   * distincao importa: sem ela nao haveria como diferenciar "nao mexe no
   * telefone" de "apaga o telefone".
   */
  atualizarDados(
    id: string,
    dados: { nome?: string | null; telefone?: string | null; telefoneHash?: string | null },
  ): Promise<AdminUser>;
  atualizarSenha(id: string, passwordHash: string): Promise<void>;
}
