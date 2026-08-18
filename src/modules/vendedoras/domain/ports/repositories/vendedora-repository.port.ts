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
  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(idErp: string): Promise<Vendedora | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<Vendedora | null>;
  buscarPorEmailHash(hash: string): Promise<Vendedora | null>;
  buscarPorWhatsappHash(hash: string): Promise<Vendedora | null>;
  listar(filtros: FiltroVendedora): Promise<Vendedora[]>;
  atualizar(vendedora: Vendedora): Promise<Vendedora>;

  /**
   * Exclusao FISICA do registro. Nao confundir com `ativo = false`, que e o
   * desligamento suave usado no dia a dia e o que as telas fazem.
   *
   * Todas as referencias caem para NULL por ON DELETE SET NULL: vendas,
   * consignacoes, conversas, agente_eventos e as tres colunas de codigo em
   * clientes/clientes_perfil (FKs criadas na migracao 29). O historico
   * sobrevive anonimizado; a atribuicao a esta vendedora, nao — e nao ha
   * como reconstruir depois.
   */
  remover(id: string): Promise<void>;
}
