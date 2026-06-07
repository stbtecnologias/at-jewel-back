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
}
