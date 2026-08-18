import { LocalEstoque } from '../../entities/local-estoque.entity';

export interface FiltroLocalEstoque {
  ativo?: boolean;
  /** Busca parcial, case-insensitive, no nome. */
  busca?: string;
}

export interface ILocalEstoqueRepository {
  criar(registro: LocalEstoque): Promise<LocalEstoque>;
  buscarPorId(id: string): Promise<LocalEstoque | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<LocalEstoque | null>;
  listar(filtros: FiltroLocalEstoque): Promise<LocalEstoque[]>;
  atualizar(registro: LocalEstoque): Promise<LocalEstoque>;

  /**
   * Exclusao FISICA. Nao confundir com `ativo = false`, o desligamento suave.
   *
   * `estoque.local_estoque_id` referencia esta tabela, entao o banco recusa apagar
   * um registro que tenha saldo vinculado. E o comportamento desejado: saldo
   * apontando para ninguem seria pior que a chamada falhar.
   */
  remover(id: string): Promise<void>;
}
