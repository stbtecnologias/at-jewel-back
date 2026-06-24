import { Venda } from '../../entities/venda.entity';
import { StatusVenda, FormaPagamento } from '../../entities/enums';

export interface FiltroVenda {
  /** data_venda >= este valor (inclusivo). */
  dataDe?: Date;
  /** data_venda <= este valor (inclusivo). */
  dataAte?: Date;
  clienteId?: string;
  vendedoraId?: string;
  status?: StatusVenda;
  /** Considera apenas vendas que tenham ao menos um pagamento nesta forma. */
  formaPagamento?: FormaPagamento;
  /** Paginacao: itens por pagina. */
  limit?: number;
  /** Paginacao: deslocamento. */
  offset?: number;
}

/**
 * Read-model achatado para a listagem administrativa de vendas (tabela do
 * dashboard). Diferente de `Venda.toResumo()`, ja vem enriquecido em SQL com
 * o nome da vendedora, o produto de maior valor da venda, a contagem de itens
 * e as formas de pagamento distintas — sem carregar o agregado na memoria nem
 * incorrer em N+1. Nenhuma PII do cliente trafega (apenas a FK clienteId).
 */
export interface VendaResumo {
  id: string;
  codigoErp: string | null;
  clienteId: string | null;
  vendedoraId: string | null;
  vendedoraNome: string | null;
  dataVenda: Date;
  dataContato: Date | null;
  valorBruto: number;
  valorDesconto: number;
  valorTotal: number;
  status: StatusVenda;
  ativo: boolean;
  /** Nome do item de maior valor_total_item da venda (ou null se sem itens). */
  produtoPrincipal: string | null;
  /** Quantidade de linhas de item da venda. */
  qtdItens: number;
  /** Formas de pagamento DISTINTAS usadas na venda. */
  formasPagamento: FormaPagamento[];
  criadoEm: Date;
  atualizadoEm: Date;
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
 * Linha do comparativo de desempenho por vendedora (RF-USU-02). Agregados de
 * vendas CONCLUIDAS e ativas no recorte. Sem PII — apenas a FK/nome da
 * vendedora e numeros. `vendedoraId` pode ser null (vendas sem vendedora).
 */
export interface ComparativoVendedora {
  vendedoraId: string | null;
  vendedoraNome: string | null;
  totalVendas: number;
  receita: number;
  ticketMedio: number;
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
   * Lista vendas para a tabela administrativa, ja enriquecidas (read-model
   * VendaResumo) com nome da vendedora, produto principal, contagem de itens
   * e formas de pagamento. Filtros e paginacao; ordena por data_venda desc.
   */
  listar(filtros: FiltroVenda): Promise<VendaResumo[]>;

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
   * Resolve o ID da vendedora vinculada a um usuario admin (RF-USU-02), via
   * vendedoras.admin_user_id. Retorna null se o usuario nao for uma vendedora.
   * Usado para isolar a carteira: quem nao tem vendas:read_all so ve as
   * proprias vendas.
   */
  resolverVendedoraIdPorAdminUser(adminUserId: string): Promise<string | null>;

  /**
   * Comparativo de desempenho por vendedora (RF-USU-02) para a gestao. Agrega
   * vendas CONCLUIDAS e ativas por vendedora no recorte (periodo opcional),
   * ordenado por receita desc. Exposto apenas a quem tem vendas:read_all.
   */
  comparativoPorVendedora(
    filtros: Pick<FiltroVenda, 'dataDe' | 'dataAte'>,
  ): Promise<ComparativoVendedora[]>;

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
