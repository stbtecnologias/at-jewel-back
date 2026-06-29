import { Cliente } from '../../entities/cliente.entity';
import { ClientePerfil } from '../../entities/cliente-perfil.entity';
import { TabelaPreco } from '../../entities/enums';

export interface FiltroCliente {
  ativo?: boolean;
  tabelaPreco?: TabelaPreco;
  codigoErp?: string;
  vendedoraCodigoErp?: string;
}

export interface TierCliente {
  tier: string;
  total: number;
}

/**
 * Filtro comum das telas administrativas (periodo + recorte demografico).
 * Definido localmente para NAO acoplar o modulo de clientes ao de analytics;
 * o shape e equivalente ao FiltroAnalitico. Agregado, sem PII.
 */
export interface FiltroDemografico {
  dataInicio?: Date;
  dataFim?: Date;
  sexo?: string;
  origem?: string;
  faixaEtaria?: string;
}

export interface IClienteRepository {
  // Distribuicao de clientes por faixa de fidelidade (nº de compras concluidas).
  distribuicaoTiers(filtro?: FiltroDemografico): Promise<TierCliente[]>;

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
