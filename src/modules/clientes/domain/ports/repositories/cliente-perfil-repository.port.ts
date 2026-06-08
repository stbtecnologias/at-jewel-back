import { ClientePerfil } from '../../entities/cliente-perfil.entity';
import { EstadoConversaAgente } from '../../entities/enums';

export interface IClientePerfilRepository {
  buscarPorClienteId(clienteId: string): Promise<ClientePerfil | null>;
  buscarPorWhatsappHash(hash: string): Promise<ClientePerfil | null>;
  atualizar(perfil: ClientePerfil): Promise<ClientePerfil>;

  /**
   * Lista perfis cujo estado_conversa esta em `estados`, ordenados por
   * estado_atualizado_em ASC (mais antigo primeiro). Usado pela Sofia para
   * monitoramento de SLA. `limit` limita o tamanho do retorno.
   *
   * Query suportada pelo indice composto idx_perfil_estado_sla
   * (estado_conversa, estado_atualizado_em) — ver migracao 12.
   */
  listarPorEstados(
    estados: EstadoConversaAgente[],
    limit: number,
  ): Promise<ClientePerfil[]>;

  /**
   * Hard delete do perfil. Usado para atender direito ao esquecimento (LGPD).
   * Nao afeta `clientes` nem historico de vendas — o CASCADE eh apenas no
   * sentido cliente -> perfil, nao o contrario.
   */
  deletar(clienteId: string): Promise<void>;
}
