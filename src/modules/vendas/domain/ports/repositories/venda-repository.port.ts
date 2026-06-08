import { Venda } from '../../entities/venda.entity';
import { StatusVenda } from '../../entities/enums';

export interface FiltroVenda {
  /** data_venda >= este valor (inclusivo). */
  dataDe?: Date;
  /** data_venda <= este valor (inclusivo). */
  dataAte?: Date;
  clienteId?: string;
  vendedoraId?: string;
  status?: StatusVenda;
  /** Paginacao: itens por pagina. */
  limit?: number;
  /** Paginacao: deslocamento. */
  offset?: number;
}

/**
 * Resumo agregado de vendas. Calculado via SQL (sem carregar linhas na
 * memoria). Contem apenas agregados — nenhum dado de PII trafega aqui.
 */
export interface ResumoVendas {
  /** Total de vendas concluidas no recorte (base de receita/ticket). */
  totalVendas: number;
  /** Soma de valor_total das vendas concluidas. */
  receitaTotal: number;
  /** receitaTotal / totalVendas (0 quando nao ha vendas concluidas). */
  ticketMedio: number;
  /** Soma de quantidade dos itens das vendas concluidas. */
  totalItens: number;
  /** Contagem de vendas por status (todas, independente de receita). */
  porStatus: {
    concluida: number;
    cancelada: number;
    pendente: number;
  };
}

/**
 * Item resumido do historico de compras de um cliente. Apenas dados de
 * venda — nenhuma PII do cliente. `qtdItens` e a contagem de linhas de item.
 */
export interface ItemHistoricoCliente {
  id: string;
  dataVenda: Date;
  valorTotal: number;
  status: StatusVenda;
  vendedoraId: string | null;
  qtdItens: number;
}

/** Resumo do historico de compras de um cliente (apenas vendas concluidas). */
export interface ResumoHistoricoCliente {
  totalCompras: number;
  valorTotal: number;
  ticketMedio: number;
  ultimaCompraEm: Date | null;
}

export interface HistoricoCliente {
  resumo: ResumoHistoricoCliente;
  vendas: ItemHistoricoCliente[];
}

export interface IVendaRepository {
  /**
   * Cria venda + itens + pagamentos em uma unica transacao. O agregado
   * ja chega validado pela camada de aplicacao (somatorios conferidos).
   */
  criarComAgregado(venda: Venda): Promise<Venda>;

  /**
   * Upsert do agregado completo por `codigo_erp`, em uma unica transacao.
   * Se ja existe venda com aquele codigo, atualiza o header e SUBSTITUI os
   * filhos (itens e pagamentos sao apagados e recriados); senao cria.
   *
   * Usado pela ingestao via ERP (/erp/vendas), que pode reenviar uma venda
   * atualizada (ex.: cancelamento). A venda DEVE ter `codigoErp` definido.
   */
  upsertByCodigoErp(venda: Venda): Promise<Venda>;

  /**
   * Busca venda por UUID. `incluirAgregado = true` carrega itens e
   * pagamentos; listagem usa false para nao pagar o custo do join.
   */
  buscarPorId(id: string, opts?: { incluirAgregado?: boolean }): Promise<Venda | null>;

  buscarPorCodigoErp(codigoErp: string): Promise<Venda | null>;

  /**
   * Lista vendas (sem agregado) com filtros e paginacao. Ordena por
   * data_venda desc (mais recentes primeiro).
   */
  listar(filtros: FiltroVenda): Promise<Venda[]>;

  /**
   * Retorna os IDs (UUID) DISTINTOS de vendedoras que tiveram ao menos uma
   * venda CONCLUIDA e ativa para o cliente informado. Usado pelo algoritmo de
   * sugestao (roteamento da Anastasia) para detectar relacionamento previo.
   *
   * Retorna so a FK da vendedora — nenhum dado de venda nem PII do cliente.
   * Vendas canceladas/pendentes ou inativas NAO contam como relacionamento.
   */
  listarVendedoraIdsPorCliente(clienteId: string): Promise<string[]>;

  /**
   * Big-numbers de vendas para o dashboard. Calcula tudo via SQL agregado
   * parametrizado (sem carregar as vendas na memoria). Receita, ticket medio
   * e total de itens consideram apenas vendas CONCLUIDAS e ativas; `porStatus`
   * conta todas as vendas ativas do recorte por status.
   *
   * Filtros opcionais: periodo (dataDe/dataAte), vendedora e status. Quando
   * `status` e informado, o recorte inteiro (inclusive os agregados de
   * receita) e limitado aquele status.
   */
  resumoAgregado(filtros: FiltroVenda): Promise<ResumoVendas>;

  /**
   * Historico de compras de um cliente para o dashboard. Retorna a lista de
   * vendas do cliente (todos os status) ja com a contagem de itens por venda
   * (sem N+1) e um resumo agregado calculado apenas sobre vendas CONCLUIDAS.
   * Ordena por data_venda desc. Paginacao opcional afeta apenas a lista; o
   * resumo cobre todo o historico concluido do cliente.
   */
  listarHistoricoPorCliente(
    clienteId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<HistoricoCliente>;
}
