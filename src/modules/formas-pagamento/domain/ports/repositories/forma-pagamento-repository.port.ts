import { FormaPagamentoEntity } from '../../entities/forma-pagamento.entity';
import { FormaPagamento as ClassificacaoPagamento } from '../../../../vendas/domain/entities/enums';

export interface FiltroFormaPagamento {
  ativo?: boolean;
  classificacao?: ClassificacaoPagamento;
  /** Busca parcial, case-insensitive, no nome. */
  busca?: string;
}

export interface IFormaPagamentoRepository {
  criar(forma: FormaPagamentoEntity): Promise<FormaPagamentoEntity>;
  buscarPorId(id: string): Promise<FormaPagamentoEntity | null>;
  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<FormaPagamentoEntity | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<FormaPagamentoEntity | null>;
  listar(filtros: FiltroFormaPagamento): Promise<FormaPagamentoEntity[]>;
  atualizar(forma: FormaPagamentoEntity): Promise<FormaPagamentoEntity>;

  /**
   * Exclusao FISICA. Nao confundir com `ativo = false`, o desligamento suave —
   * que aqui e o caminho quase sempre correto: forma de pagamento
   * descontinuada precisa continuar existindo para as vendas antigas fazerem
   * sentido.
   *
   * Hoje nenhuma FK aponta para esta tabela: `pagamentos_venda.forma_pagamento`
   * ainda e o ENUM. Quando virar FK (mudanca destrutiva, fatiada em cinco
   * passos), apagar uma forma usada em venda historica passa a ser impedido —
   * e sera o comportamento certo.
   */
  remover(id: string): Promise<void>;
}
