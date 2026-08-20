import { Cliente } from '../../entities/cliente.entity';
import { ClientePerfil } from '../../entities/cliente-perfil.entity';
import { TabelaPreco } from '../../entities/enums';

/** Uma linha de resposta sobre a carteira. Sem telefone e sem e-mail. */
export interface ClienteDaCarteira {
  id: string;
  nome: string;
  /** Nula quando o cliente nunca comprou. */
  ultimaCompra: Date | null;
  /** Quantidade de itens no recorte (ou de compras, quando sem categoria). */
  quantidade: number;
  valorTotal: number;
}

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
  idadeMin?: number;
  idadeMax?: number;
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
   * Cria cliente SEM perfil. Usado quando o cadastro chega por outra via que
   * nao o WhatsApp — tipicamente a integracao do ERP.
   *
   * Nao criar o perfil e proposital: ele nasceria em `TRIAGE_IN_PROGRESS`
   * (NOT NULL com default) e deixaria o cliente pendurado no funil sem nunca
   * ter conversado. O perfil e criado depois, quando houver triagem.
   */
  criar(cliente: Cliente): Promise<Cliente>;

  /**
   * Busca cliente por UUID. `incluirPerfil = true` carrega o `perfil`.
   */
  buscarPorId(id: string, opts?: { incluirPerfil?: boolean }): Promise<Cliente | null>;

  /** Identidade no ERP — chave da sincronizacao. */
  buscarPorIdErp(
    idErp: string,
    opts?: { incluirPerfil?: boolean },
  ): Promise<Cliente | null>;
  buscarPorCodigoErp(codigoErp: string): Promise<Cliente | null>;

  /**
   * Busca por parte do nome, sem acento e sem diferenciar maiuscula. Usada
   * pela tool avisar_vendedora da Anastasia, onde o ADM digita o nome como
   * lembra. O limite existe para responder "achei varios" sem varrer a base.
   */
  buscarPorNomeParcial(termo: string, limite: number): Promise<Cliente[]>;

  /**
   * Clientes da carteira de UMA vendedora que estao ha `meses` sem comprar,
   * do mais parado para o menos.
   *
   * A carteira sai de `clientes.vendedora_codigo_erp`. O codigo e parametro
   * obrigatorio da consulta — nao existe versao sem recorte, entao nao existe
   * caminho para a carteira de outra pessoa.
   *
   * Cliente que NUNCA comprou entra na lista, com `ultimaCompra` nula: para
   * quem vai ligar, "nunca comprou" e tao relevante quanto "faz oito meses".
   */
  inativosDaCarteira(
    vendedoraCodigoErp: string,
    meses: number,
    limite: number,
  ): Promise<ClienteDaCarteira[]>;

  /**
   * Os maiores compradores da carteira, opcionalmente de uma categoria de
   * produto ("Anel", "Colar").
   *
   * Conta TODAS as compras do cliente, nao so as vendas daquela vendedora: a
   * pergunta e sobre o comportamento do cliente, e a carteira e o recorte
   * (decisao do Lucas, 20/08/2026).
   */
  maioresCompradoresDaCarteira(
    vendedoraCodigoErp: string,
    opcoes: { categoria?: string; desde?: Date; limite: number },
  ): Promise<ClienteDaCarteira[]>;
  buscarPorTelefone1Hash(hash: string): Promise<Cliente | null>;
  buscarPorEmailHash(hash: string): Promise<Cliente | null>;

  /**
   * Lista clientes com filtros. Listagem NAO carrega perfil — quem precisar
   * usa buscarPorId com `incluirPerfil` true.
   */
  listar(filtros: FiltroCliente): Promise<Cliente[]>;

  atualizar(cliente: Cliente): Promise<Cliente>;

  /**
   * Exclusao FISICA. Nao confundir com `ativo = false`, o desligamento suave.
   *
   * `clientes_perfil` cai por CASCADE — some todo o dado da triagem — e as
   * demais referencias (vendas, conversas, agente_eventos, consignacoes) caem
   * para NULL. Nada disso levanta erro nem e reconstruivel depois.
   */
  remover(id: string): Promise<void>;
}
