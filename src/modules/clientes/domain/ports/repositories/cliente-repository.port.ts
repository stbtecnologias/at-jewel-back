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
  /** Parte do nome (ILIKE). Combina com os demais filtros em AND. */
  nome?: string;
  /** Teto de linhas. Sem ele a listagem devolve a base inteira. */
  limit?: number;
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
  /**
   * Clientes da carteira de UMA vendedora cujo nome casa com o termo.
   *
   * NAO E `buscarPorNomeParcial` COM FILTRO DEPOIS. O recorte entra no
   * `WHERE`: cliente de fora da carteira nao e recusado, ele nao existe para
   * esta consulta. A diferenca importa porque a RECUSA tambem vaza — dizer
   * "esse cliente e de outra vendedora" ja conta que ele existe e que tem
   * dona. Aqui a resposta e a mesma de nome errado: lista vazia.
   */
  buscarNaCarteiraPorNome(
    vendedoraCodigoErp: string,
    termo: string,
    limite: number,
  ): Promise<Cliente[]>;

  inativosDaCarteira(
    vendedoraCodigoErp: string,
    meses: number,
    limite: number,
  ): Promise<ClienteDaCarteira[]>;

  /**
   * QUANTOS estao parados, sem trazer a lista.
   *
   * Existe para a resposta nao mentir por omissao. Uma carteira de mil
   * clientes devolve dez, e sem o total a frase "estes estao parados" soa
   * completa — quem le vai embora achando que sao dez. Com o numero, a agente
   * pode dizer "dez dos cento e quarenta e tres" e oferecer refinar.
   */
  contarInativosDaCarteira(
    vendedoraCodigoErp: string,
    meses: number,
  ): Promise<number>;

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

  /** Quantos clientes da carteira compraram, no mesmo recorte. */
  contarCompradoresDaCarteira(
    vendedoraCodigoErp: string,
    opcoes: { categoria?: string; desde?: Date },
  ): Promise<number>;
  buscarPorTelefone1Hash(hash: string): Promise<Cliente | null>;
  buscarPorEmailHash(hash: string): Promise<Cliente | null>;

  /**
   * Lista clientes com filtros. Listagem NAO carrega perfil — quem precisar
   * usa buscarPorId com `incluirPerfil` true.
   */
  listar(filtros: FiltroCliente): Promise<Cliente[]>;

  atualizar(cliente: Cliente): Promise<Cliente>;

  /**
   * Move o cliente para a carteira de outra vendedora.
   *
   * UPDATE CIRURGICO de uma coluna so, e nao `atualizar(cliente)`, de
   * proposito: a entidade e imutavel e reescreve-la faria a camada de
   * infraestrutura RECIFRAR telefone e e-mail a cada transferencia. Ciframento
   * com IV novo a cada gravacao muda os bytes sem mudar o dado — e um jeito
   * silencioso de sujar o historico e desperdicar escrita.
   *
   * `null` desvincula (cliente sem carteira).
   */
  transferirCarteira(clienteId: string, vendedoraCodigoErp: string | null): Promise<void>;

  /**
   * Exclusao FISICA. Nao confundir com `ativo = false`, o desligamento suave.
   *
   * `clientes_perfil` cai por CASCADE — some todo o dado da triagem — e as
   * demais referencias (vendas, conversas, agente_eventos, consignacoes) caem
   * para NULL. Nada disso levanta erro nem e reconstruivel depois.
   */
  remover(id: string): Promise<void>;
}
