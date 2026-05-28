import { Cliente } from '../../entities/cliente.entity';
import { ClientePerfil } from '../../entities/cliente-perfil.entity';
import { TabelaPreco } from '../../entities/enums';

export interface FiltroCliente {
  ativo?: boolean;
  tabelaPreco?: TabelaPreco;
  codigoErp?: string;
  vendedoraCodigoErp?: string;
}

export interface IClienteRepository {
  /**
   * Cria cliente novo + perfil inicial em uma unica transacao.
   * Usado quando a Anastasia recebe um WhatsApp de numero desconhecido.
   */
  criarComPerfil(cliente: Cliente, perfil: ClientePerfil): Promise<Cliente>;

  /**
   * Busca cliente por UUID. `incluirPerfil = true` carrega o `perfil`.
   */
  buscarPorId(id: string, opts?: { incluirPerfil?: boolean }): Promise<Cliente | null>;

  buscarPorCodigoErp(codigoErp: string): Promise<Cliente | null>;
  buscarPorTelefone1Hash(hash: string): Promise<Cliente | null>;
  buscarPorEmailHash(hash: string): Promise<Cliente | null>;

  /**
   * Lista clientes com filtros. Listagem NAO carrega perfil — quem precisar
   * usa buscarPorId com `incluirPerfil` true.
   */
  listar(filtros: FiltroCliente): Promise<Cliente[]>;

  atualizar(cliente: Cliente): Promise<Cliente>;
}
