import { OperacaoClasse } from '../../entities/enums';
import { OperacaoEntity } from '../../entities/operacao.entity';

export interface FiltroOperacao {
  ativo?: boolean;
  classificacao?: OperacaoClasse;
  /** Busca parcial, case-insensitive, no nome. */
  busca?: string;
}

/**
 * SEM `remover`, e de proposito.
 *
 * `movimentacoes.operacao_id` e ON DELETE RESTRICT (migracao 46): o banco ja
 * recusaria apagar uma operacao com documento pendurado. Expor a rota so
 * produziria um 500 vindo do Postgres em vez de uma resposta util — e o
 * caminho certo aqui e sempre `ativo = false`, porque operacao descontinuada
 * precisa continuar existindo para as movimentacoes historicas fazerem
 * sentido.
 */
export interface IOperacaoRepository {
  criar(operacao: OperacaoEntity): Promise<OperacaoEntity>;
  buscarPorId(id: string): Promise<OperacaoEntity | null>;
  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<OperacaoEntity | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<OperacaoEntity | null>;
  listar(filtros: FiltroOperacao): Promise<OperacaoEntity[]>;
  atualizar(operacao: OperacaoEntity): Promise<OperacaoEntity>;
}
