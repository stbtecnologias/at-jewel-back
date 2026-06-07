import { VendedoraMetricas } from '../../entities/vendedora-metricas.entity';

export interface IVendedoraMetricasRepository {
  /** Lista as metricas de todas as vendedoras (linhas da matview). */
  listar(): Promise<VendedoraMetricas[]>;

  /** Busca as metricas de uma vendedora pela FK. Null se nao houver linha
   *  (vendedora sem nenhuma venda concluida nao aparece na matview). */
  buscarPorVendedoraId(vendedoraId: string): Promise<VendedoraMetricas | null>;

  /** Executa REFRESH MATERIALIZED VIEW CONCURRENTLY na matview. */
  refresh(): Promise<void>;
}
