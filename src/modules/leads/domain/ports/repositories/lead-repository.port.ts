import type { EstadoConversaAgente } from '../../../../clientes/domain/entities/enums';

/** Origem do contato — mesmo enum de `clientes_perfil.origem_contato`. */
export type OrigemContato =
  | 'whatsapp'
  | 'instagram'
  | 'site'
  | 'indicacao'
  | 'loja_fisica'
  | 'outro';

/** Ocasiao — mesmo enum de `atendimentos.ocasiao`. */
export type OcasiaoLead =
  | 'CASAMENTO'
  | 'NOIVADO'
  | 'ANIVERSARIO'
  | 'FORMATURA'
  | 'DATA_COMEMORATIVA'
  | 'AUTOPRESENTE'
  | 'OUTRO';

/**
 * O CICLO DE VIDA DO LEAD NA MAO DA VENDEDORA — migracao 60, 22/09/2026.
 *
 * ==========================================================================
 * QUATRO, E NAO OITO — E A RESISTENCIA E O PONTO.
 *
 * A tentacao seria espelhar aqui as seis etapas de atendimento (em
 * negociacao, remarcado, sem contato...). Isso manteria DUAS verdades sobre a
 * mesma negociacao, e elas divergiriam na primeira mudanca de regra — sem
 * ninguem notar, porque as duas continuariam respondendo.
 *
 * A divisao e outra: o lead responde "isso ainda esta comigo?", e o
 * ATENDIMENTO responde "em que pe esta". Quando o lead vira cliente, o
 * atendimento assume dali — e e por isso que `VIROU_CLIENTE` e um fim de
 * linha aqui, e nao um comeco de escala.
 * ==========================================================================
 */
export type StatusLeadVendedora =
  /** Encaminhado e ainda intocado. Todo lead nasce assim (ver a migracao 60). */
  | 'NOVO'
  /** Ela ja falou com a pessoa, e aquilo esta andando. */
  | 'EM_CONTATO'
  /** Comprou ou virou cadastro. Ver `clienteId` — o vinculo pode nao ter sido achado. */
  | 'VIROU_CLIENTE'
  /** A baixa. O motivo, quando existe, esta na observacao. */
  | 'NAO_VINGOU';

/** Os quatro, para validar entrada e montar contagem sem esquecer nenhum. */
export const STATUS_LEAD_VENDEDORA: readonly StatusLeadVendedora[] = [
  'NOVO',
  'EM_CONTATO',
  'VIROU_CLIENTE',
  'NAO_VINGOU',
] as const;

/** Os que ainda estao na mao dela — o recorte padrao da lista. */
export const STATUS_LEAD_EM_ABERTO: readonly StatusLeadVendedora[] = [
  'NOVO',
  'EM_CONTATO',
] as const;

export interface Lead {
  id: string;
  nome: string | null;
  apelido: string | null;
  /** Plaintext: a coluna e cifrada, o transformer decifra na leitura. */
  whatsapp: string;
  origemContato: OrigemContato | null;
  ocasiao: OcasiaoLead | null;
  produtosDesejados: string | null;
  resumoTriagem: string | null;
  vendedoraSugeridaCodigo: string | null;
  estado: EstadoConversaAgente;
  estadoAtualizadoEm: Date;
  clienteId: string | null;
  vinculadoEm: Date | null;
  direcionadoGestaoEm: Date | null;
  vendedoraAprovadaCodigo: string | null;
  direcionadoVendedoraEm: Date | null;
  fechadoEm: Date | null;

  /**
   * O QUE A VENDEDORA FEZ COM O LEAD — 22/09/2026.
   *
   * Null nos leads que nunca chegaram a uma vendedora (ainda em triagem, ou
   * parados na fila da gestao). Quem foi encaminhado nasce `NOVO`.
   */
  statusVendedora: StatusLeadVendedora | null;
  statusVendedoraEm: Date | null;

  /** A frase dela sobre este lead. Em claro no banco, e nao cifrada. */
  observacaoVendedora: string | null;

  criadoEm: Date;
}

export interface CriarLeadInput {
  whatsapp: string;
  whatsappHash: string;
  nome?: string | null;
  apelido?: string | null;
  origemContato?: OrigemContato | null;
  ocasiao?: OcasiaoLead | null;
  produtosDesejados?: string | null;
  resumoTriagem?: string | null;
  vendedoraSugeridaCodigo?: string | null;
  /** Vem junto com `vinculadoEm` ou nao vem — ver `chk_lead_vinculo`. */
  clienteId?: string | null;
}

/**
 * Campos que a triagem preenche ao longo da conversa. Tudo opcional: a
 * Anastasia descobre as coisas fora de ordem, e `undefined` significa "nao
 * mexe", enquanto `null` apaga.
 */
export interface AtualizarLeadInput {
  nome?: string | null;
  apelido?: string | null;
  origemContato?: OrigemContato | null;
  ocasiao?: OcasiaoLead | null;
  produtosDesejados?: string | null;
  resumoTriagem?: string | null;
  vendedoraSugeridaCodigo?: string | null;
  estado?: EstadoConversaAgente;
  direcionadoGestaoEm?: Date | null;
}

export interface ILeadRepository {
  /**
   * O lead em andamento daquele numero, se houver. E o primeiro passo do
   * reconhecimento: mensagem que chega com lead aberto CONTINUA a conversa,
   * nao comeca outra.
   */
  buscarAbertoPorHash(whatsappHash: string): Promise<Lead | null>;

  /**
   * O lead mais recente daquele numero, aberto ou fechado. Serve para
   * reaproveitar nome e apelido de quem ja passou por aqui.
   */
  buscarUltimoPorHash(whatsappHash: string): Promise<Lead | null>;

  buscarPorId(id: string): Promise<Lead | null>;

  criar(input: CriarLeadInput): Promise<Lead>;

  atualizar(id: string, input: AtualizarLeadInput): Promise<Lead>;

  /** Preenche a ponte com o ERP. Grava `vinculado_em` junto, sempre. */
  vincularCliente(id: string, clienteId: string): Promise<Lead>;

  /**
   * O ADM escolheu a vendedora. Grava codigo e carimbo juntos (exigencia do
   * `chk_lead_encaminhamento`) e FECHA o lead — o que libera o numero para um
   * proximo atendimento, pelo indice parcial da migracao 40.
   */
  encaminhar(id: string, vendedoraCodigo: string): Promise<Lead>;

  /** Os leads que subiram para a gestao e ainda ninguem encaminhou. */
  listarAguardandoGestao(limite: number): Promise<Lead[]>;

  /**
   * Os leads ENCAMINHADOS para uma vendedora, do mais novo para o mais velho.
   *
   * ==========================================================================
   * O LEAD ENCAMINHADO SO EXISTIA NA MENSAGEM — 21/09/2026.
   *
   * Encaminhar nao cria atendimento (decisao de 03/09), entao a vendedora nao
   * tinha onde consultar o que recebeu: o nome, o que a pessoa procura e o
   * telefone viviam numa unica mensagem de WhatsApp. Apagar a conversa, trocar
   * de aparelho ou perder o numero significava perder o lead — e ninguem
   * saberia, porque no banco ele consta como encaminhado.
   * ==========================================================================
   */
  listarPorVendedora(
    vendedoraCodigo: string,
    limite: number,
    /**
     * SO O QUE AINDA ESTA COM ELA — `NOVO` e `EM_CONTATO`.
     *
     * ========================================================================
     * O PADRAO E `true`, E E O CONSERTO DE 22/09/2026.
     *
     * Sem recorte, "tenho algum lead?" devolvia tudo o que ja foi encaminhado
     * para ela desde sempre. O teto de 10 escondia o problema por acidente:
     * "os 10 mais recentes" nao e "o que eu preciso atender", e um lead de
     * tres semanas que ela nunca ligou sumia sem ninguem notar.
     *
     * `false` devolve o historico inteiro, para quem PERGUNTAR por ele.
     * ========================================================================
     */
    apenasAbertos?: boolean,
  ): Promise<Lead[]>;

  /**
   * A vendedora mexeu no lead: status novo, e a frase dela quando houver.
   *
   * GRAVA STATUS E CARIMBO JUNTOS — o `chk_lead_status_vendedora` exige, e a
   * razao e a mesma do `chk_lead_vinculo`: status sem data esconde QUANDO ela
   * mexeu, que e o que permite cobrar um lead parado.
   *
   * `observacao` ausente NAO apaga a que existe — ela troca de status sem
   * necessariamente ter o que escrever. `null` apaga, de propósito.
   */
  atualizarStatusVendedora(
    id: string,
    status: StatusLeadVendedora,
    observacao?: string | null,
  ): Promise<Lead>;

  /**
   * Quantos leads em cada estado, e quantos foram para cada vendedora.
   *
   * CONTAGEM, e nao lista: o panorama responde "como esta a fila", e trazer
   * centenas de linhas para somar em memoria seria pagar caro pela mesma
   * resposta.
   */
  panoramaDeLeads(): Promise<PanoramaDeLeads>;
}

/** O retrato da fila de leads. */
export interface PanoramaDeLeads {
  /** Quantos em cada estado, incluindo os zerados de proposito. */
  porEstado: { estado: EstadoConversaAgente; quantos: number }[];
  /** Quantos foram encaminhados para cada vendedora, da maior para a menor. */
  porVendedora: { codigo: string; quantos: number }[];
  total: number;
}
