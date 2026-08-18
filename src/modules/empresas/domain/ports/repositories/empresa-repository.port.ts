import { Empresa } from '../../entities/empresa.entity';

export interface FiltroEmpresa {
  ativo?: boolean;
  /** Busca parcial, case-insensitive, no nome. */
  busca?: string;
}

export interface IEmpresaRepository {
  criar(empresa: Empresa): Promise<Empresa>;
  buscarPorId(id: string): Promise<Empresa | null>;
  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<Empresa | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<Empresa | null>;
  listar(filtros: FiltroEmpresa): Promise<Empresa[]>;
  atualizar(empresa: Empresa): Promise<Empresa>;

  /**
   * Exclusao FISICA. Nao confundir com `ativo = false`, o desligamento suave.
   *
   * Hoje nenhuma FK aponta para `empresas`. Isso MUDA assim que
   * `vendas.empresa_id` (RF-INT-06) e a tabela de estoque existirem — e ai
   * apagar uma empresa com venda ou estoque vinculado precisa ser impedido,
   * nao permitido em silencio.
   */
  remover(id: string): Promise<void>;
}
