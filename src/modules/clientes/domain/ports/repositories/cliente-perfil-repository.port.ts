import { ClientePerfil } from '../../entities/cliente-perfil.entity';

export interface IClientePerfilRepository {
  buscarPorClienteId(clienteId: string): Promise<ClientePerfil | null>;
  buscarPorWhatsappHash(hash: string): Promise<ClientePerfil | null>;
  atualizar(perfil: ClientePerfil): Promise<ClientePerfil>;

  /**
   * Hard delete do perfil. Usado para atender direito ao esquecimento (LGPD).
   * Nao afeta `clientes` nem historico de vendas — o CASCADE eh apenas no
   * sentido cliente -> perfil, nao o contrario.
   */
  deletar(clienteId: string): Promise<void>;
}
