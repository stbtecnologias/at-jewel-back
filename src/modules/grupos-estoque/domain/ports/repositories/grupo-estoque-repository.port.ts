import { GrupoEstoque } from '../../entities/grupo-estoque.entity';

export interface FiltroGrupoEstoque {
  ativo?: boolean;
  /** Busca parcial, case-insensitive, no nome. */
  busca?: string;
}

export interface IGrupoEstoqueRepository {
  criar(registro: GrupoEstoque): Promise<GrupoEstoque>;
  buscarPorId(id: string): Promise<GrupoEstoque | null>;
  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<GrupoEstoque | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<GrupoEstoque | null>;
  listar(filtros: FiltroGrupoEstoque): Promise<GrupoEstoque[]>;
  atualizar(registro: GrupoEstoque): Promise<GrupoEstoque>;

  /**
   * Exclusao FISICA. Nao confundir com `ativo = false`, o desligamento suave.
   *
   * `estoque.grupo_estoque_id` referencia esta tabela, entao o banco recusa apagar
   * um registro que tenha saldo vinculado. E o comportamento desejado: saldo
   * apontando para ninguem seria pior que a chamada falhar.
   */
  remover(id: string): Promise<void>;
}
