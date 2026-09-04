import { OperacaoClasse } from '../../entities/enums';
import { OperacaoEntity } from '../../entities/operacao.entity';

export interface FiltroOperacao {
  ativo?: boolean;
  classificacao?: OperacaoClasse;
  /** Busca parcial, case-insensitive, no nome. */
  busca?: string;
}

export interface IOperacaoRepository {
  criar(operacao: OperacaoEntity): Promise<OperacaoEntity>;
  buscarPorId(id: string): Promise<OperacaoEntity | null>;
  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<OperacaoEntity | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<OperacaoEntity | null>;
  listar(filtros: FiltroOperacao): Promise<OperacaoEntity[]>;
  atualizar(operacao: OperacaoEntity): Promise<OperacaoEntity>;

  /**
   * Exclusao FISICA. Existe para limpar o que nao devia ter entrado — uma
   * operacao cadastrada por engano durante a integracao.
   *
   * NAO E O CAMINHO PARA DESCONTINUAR. Operacao que a loja parou de usar
   * precisa continuar existindo, senao as movimentacoes historicas perdem o
   * sentido — para isso e `ativo = false`.
   *
   * Lanca `OperacaoEmUsoError` quando ha movimentacao vinculada: a FK e
   * ON DELETE RESTRICT, e quem recusa e o banco. O erro tipado existe para
   * quem chama poder devolver 409 em vez de deixar vazar um 500.
   */
  remover(id: string): Promise<void>;
}
