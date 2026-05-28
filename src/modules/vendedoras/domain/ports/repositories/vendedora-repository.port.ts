import { Vendedora } from '../../entities/vendedora.entity';
import { StatusDisponibilidadeVendedora, TipoVendedora } from '../../entities/enums';

export interface FiltroVendedora {
  ativo?: boolean;
  tipo?: TipoVendedora;
  statusDisponibilidade?: StatusDisponibilidadeVendedora;
  /**
   * Filtra vendedoras que tenham TODAS as especialidades listadas.
   * Sintaxe Postgres: `especialidades @> ARRAY[...]`.
   */
  especialidades?: string[];
}

export interface IVendedoraRepository {
  criar(vendedora: Vendedora): Promise<Vendedora>;
  buscarPorId(id: string): Promise<Vendedora | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<Vendedora | null>;
  buscarPorEmailHash(hash: string): Promise<Vendedora | null>;
  buscarPorWhatsappHash(hash: string): Promise<Vendedora | null>;
  listar(filtros: FiltroVendedora): Promise<Vendedora[]>;
  atualizar(vendedora: Vendedora): Promise<Vendedora>;
}
