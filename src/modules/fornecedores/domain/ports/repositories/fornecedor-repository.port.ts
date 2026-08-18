import { Fornecedor } from '../../entities/fornecedor.entity';
import { TipoPessoa } from '../../../../clientes/domain/entities/enums';

export interface FiltroFornecedor {
  ativo?: boolean;
  tipoPessoa?: TipoPessoa;
  /** Busca parcial, case-insensitive, em `nome` e `nome_fantasia`. */
  busca?: string;
  cidade?: string;
  estado?: string;
}

export interface IFornecedorRepository {
  criar(fornecedor: Fornecedor): Promise<Fornecedor>;
  buscarPorId(id: string): Promise<Fornecedor | null>;
  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<Fornecedor | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<Fornecedor | null>;
  listar(filtros: FiltroFornecedor): Promise<Fornecedor[]>;
  atualizar(fornecedor: Fornecedor): Promise<Fornecedor>;

  /**
   * Exclusao FISICA. Nao confundir com `ativo = false`, o desligamento suave.
   *
   * Hoje nao ha FK apontando para `fornecedores` — `produtos.fornecedor_id`
   * ainda nao existe (RF-INT-08, migracao futura). Quando existir, decidir o
   * ON DELETE: SET NULL preserva o produto sem origem; RESTRICT impede apagar
   * fornecedor com produto vinculado.
   */
  remover(id: string): Promise<void>;
}
