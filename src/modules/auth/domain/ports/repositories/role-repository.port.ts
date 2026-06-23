export interface RoleComPermissoes {
  chave: string;
  nome: string;
  descricao: string | null;
  isSystem: boolean;
  permissoes: string[];
}

export interface CriarRoleCmd {
  chave: string;
  nome: string;
  descricao: string | null;
  permissoes: string[];
}

export interface IRoleRepository {
  listar(): Promise<RoleComPermissoes[]>;
  buscar(chave: string): Promise<RoleComPermissoes | null>;
  criar(cmd: CriarRoleCmd): Promise<void>;
  /** Substitui o conjunto de permissoes do papel. */
  definirPermissoes(chave: string, permissoes: string[]): Promise<void>;
  atualizarMeta(chave: string, nome: string, descricao: string | null): Promise<void>;
  remover(chave: string): Promise<void>;
  /** Quantos usuarios usam este papel (para impedir remocao em uso). */
  contarUsuarios(chave: string): Promise<number>;
}
