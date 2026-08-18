import { Estoque } from '../../entities/estoque.entity';

export interface FiltroEstoque {
  empresaId?: string;
  grupoEstoqueId?: string;
  produtoId?: string;
  localEstoqueId?: string;
  fornecedorId?: string;
  clienteId?: string;
  vendedoraId?: string;
  /** Só linhas negativas — o que a casa deve a terceiros. */
  apenasNegativos?: boolean;
}

/** As quatro dimensoes que identificam um saldo. */
export interface ChaveEstoque {
  empresaId: string;
  grupoEstoqueId: string;
  produtoId: string;
  localEstoqueId?: string | null;
  fornecedorId?: string | null;
  clienteId?: string | null;
  vendedoraId?: string | null;
}

export interface IEstoqueRepository {
  criar(estoque: Estoque): Promise<Estoque>;
  buscarPorId(id: string): Promise<Estoque | null>;

  /** Busca pela chave de negocio — nao pelo id. Usada antes de criar. */
  buscarPorChave(chave: ChaveEstoque): Promise<Estoque | null>;

  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<Estoque | null>;

  listar(filtros: FiltroEstoque): Promise<Estoque[]>;
  atualizar(estoque: Estoque): Promise<Estoque>;
  remover(id: string): Promise<void>;

  /**
   * INSERT ... ON CONFLICT DO UPDATE sobre `uq_estoque_chave`.
   *
   * E o caminho da sincronizacao com o ERP, que manda a FOTO do saldo: mandar
   * de novo e o comportamento normal, nao erro. Um POST comum bateria na
   * UNIQUE na segunda rodada e devolveria conflito para uma operacao que
   * deveria ser idempotente.
   */
  upsert(estoque: Estoque): Promise<Estoque>;
}
