import type {
  DesfechoAtendimento,
  StatusInteracao,
  OcasiaoAtendimento,
  TipoInteracao,
} from '../../entities/enums';

export interface Atendimento {
  id: string;
  clienteId: string;
  vendedoraId: string;
  ocasiao: OcasiaoAtendimento | null;
  abertoEm: Date;
  fechadoEm: Date | null;
  desfecho: DesfechoAtendimento | null;
}

export interface Interacao {
  id: string;
  atendimentoId: string;
  tipo: TipoInteracao;
  combinadoEm: Date | null;
  notificarEm: Date | null;
  ocorridoEm: Date | null;
  status: StatusInteracao;
  relato: string | null;
  criadoEm: Date;
}

/** Um compromisso da vendedora: o horario combinado com aquele cliente. */
export interface CompromissoAgenda {
  atendimentoId: string;
  clienteId: string;
  combinadoEm: Date;
  ocasiao: OcasiaoAtendimento | null;
}

export interface AbrirAtendimentoInput {
  clienteId: string;
  vendedoraId: string;
  ocasiao?: OcasiaoAtendimento | null;
}

export interface CriarInteracaoInput {
  atendimentoId: string;
  tipo: TipoInteracao;
  combinadoEm?: Date | null;
  notificarEm?: Date | null;
  ocorridoEm?: Date | null;
  status?: StatusInteracao;
  relato?: string | null;
}


// ------------------------------------------------------------------
// AUDITORIA — a leitura de gestao sobre os atendimentos da equipe
// ------------------------------------------------------------------

/**
 * Em que pe esta o episodio. NAO E COLUNA: sai da view
 * `vw_atendimentos_auditoria`, calculada a partir da linha do tempo. A regra
 * e o porque de nao ser armazenada estao no cabecalho da migracao 38.
 */
export type EtapaAtendimento =
  | 'PRIMEIRO_CONTATO'
  | 'EM_NEGOCIACAO'
  | 'REMARCADO'
  | 'SEM_CONTATO'
  | 'CONCLUIDO'
  | 'NAO_AVANCOU';

export const ETAPAS_ATENDIMENTO: readonly EtapaAtendimento[] = [
  'PRIMEIRO_CONTATO',
  'EM_NEGOCIACAO',
  'REMARCADO',
  'SEM_CONTATO',
  'CONCLUIDO',
  'NAO_AVANCOU',
] as const;

export interface FiltroAuditoria {
  /** Um atendimento so. E como o detalhe pega a etapa da MESMA view da lista. */
  id?: string;
  vendedoraId?: string;
  /** Parte do nome do cliente — e como se procura "o Thiago falou com a Luana?". */
  clienteNome?: string;
  etapa?: EtapaAtendimento;
  /** Janela sobre `aberto_em`. */
  de?: Date;
  ate?: Date;
  limit: number;
  offset: number;
}

export interface AtendimentoAuditoria {
  id: string;
  clienteId: string;
  clienteNome: string;
  vendedoraId: string;
  vendedoraNome: string;
  ocasiao: OcasiaoAtendimento | null;
  etapa: EtapaAtendimento;
  abertoEm: Date;
  fechadoEm: Date | null;
  desfecho: DesfechoAtendimento | null;
  ultimaAtividadeEm: Date | null;

  /** A FILA DO QUE ESTA DEVENDO — e nao a etapa — responde "quem nao respondeu". */
  aguardandoRelato: boolean;
  interacoesExpiradas: number;
  retomadas: number;

  /** Proximo compromisso com o CLIENTE, nao o proximo disparo nosso. */
  proximoContatoEm: Date | null;

  /**
   * A ultima coisa que a vendedora contou, nas palavras dela. Vem DECIFRADO
   * — a coluna e cifrada, entao esta leitura passa pelo ORM e nunca por SQL
   * cru, que devolveria o texto embaralhado.
   */
  ultimoRelato: string | null;
}

export type ContagemPorEtapa = Record<EtapaAtendimento, number>;

export interface LinhaResumoVendedora {
  vendedoraId: string;
  nome: string;
  total: number;
  porEtapa: ContagemPorEtapa;
  /** Quantos atendimentos dela estao esperando um relato agora. */
  aguardandoRelato: number;
  ultimaAtividadeEm: Date | null;
}

export interface ResumoAuditoria {
  total: number;
  porEtapa: ContagemPorEtapa;
  vendedoras: LinhaResumoVendedora[];
}

export interface IAtendimentoRepository {
  /**
   * O atendimento EM CURSO do cliente, se houver. O banco garante no maximo um
   * (indice parcial `uq_atendimento_aberto_por_cliente`).
   */
  buscarAbertoPorCliente(clienteId: string): Promise<Atendimento | null>;

  buscarPorId(id: string): Promise<Atendimento | null>;

  abrir(input: AbrirAtendimentoInput): Promise<Atendimento>;

  /**
   * Preenche a ocasiao SOMENTE se ainda estiver vazia. Nao sobrescreve: o
   * episodio e delimitado por uma ocasiao, e trocar no meio reescreveria o que
   * ele e. Quando a ocasiao muda de verdade, o certo e outro atendimento.
   */
  completarOcasiaoSeVazia(
    atendimentoId: string,
    ocasiao: OcasiaoAtendimento,
  ): Promise<void>;

  criarInteracao(input: CriarInteracaoInput): Promise<Interacao>;

  /**
   * A interacao mais recente daquele tipo no atendimento, se houver.
   * Usada para detectar aviso repetido em janela curta.
   */
  ultimaInteracao(
    atendimentoId: string,
    tipo: TipoInteracao,
  ): Promise<Interacao | null>;

  /**
   * Move a interacao PENDENTE daquele tipo para um novo horario, ou cria se
   * ainda nao existir. E o que evita dois lembretes para o mesmo atendimento
   * quando o horario e corrigido ou o cliente remarca.
   */
  reagendar(
    atendimentoId: string,
    tipo: TipoInteracao,
    notificarEm: Date,
    combinadoEm: Date,
  ): Promise<void>;

  /**
   * A cobranca que espera relato de uma vendedora, com o atendimento a que
   * pertence. E o gancho do canal interno: quando ela responde no WhatsApp, e
   * ESTA pendencia que a resposta fecha.
   *
   * Devolve a mais recente quando ha mais de uma — na pratica raro, porque so
   * existe um atendimento aberto por cliente, mas a vendedora pode ter varios
   * clientes em curso.
   */
  buscarCobrancaAguardando(
    vendedoraId: string,
  ): Promise<{ interacao: Interacao; atendimento: Atendimento } | null>;

  /**
   * Os compromissos de UMA vendedora numa janela de tempo.
   *
   * O `vendedoraId` vem do telefone resolvido na entrada do canal, NUNCA do
   * texto da conversa. Nao existe parametro para pedir a agenda de outra
   * pessoa — e por isso que nenhuma frase consegue chegar nela.
   *
   * Le `combinado_em` (quando ela fala com o cliente), nao `notificar_em`
   * (quando o sistema manda a mensagem): a agenda dela e feita dos
   * compromissos, nao dos nossos lembretes.
   */
  listarAgenda(vendedoraId: string, de: Date, ate: Date): Promise<CompromissoAgenda[]>;

  /** Fecha o episodio. O CHECK do banco exige desfecho junto. */
  fechar(atendimentoId: string, desfecho: DesfechoAtendimento): Promise<void>;

  /** Linha do tempo completa, em ordem cronologica. */
  listarInteracoes(atendimentoId: string): Promise<Interacao[]>;

  /**
   * Interacoes agendadas que ja venceram e ainda nao foram disparadas. E a
   * varredura do agendador — sem filtro de horario comercial: o combinado com
   * o cliente vale como foi dito, inclusive domingo as 21h (decisao do Lucas,
   * 19/08/2026).
   */
  listarVencidas(agora: Date, limite: number): Promise<Interacao[]>;

  atualizarStatusInteracao(
    id: string,
    status: StatusInteracao,
    ocorridoEm?: Date | null,
  ): Promise<void>;

  /**
   * A LEITURA DE AUDITORIA. Le a view `vw_atendimentos_auditoria`, entao a
   * etapa vem calculada pelo banco e nao reimplementada aqui.
   *
   * Devolve `total` junto da pagina porque teto silencioso mente por omissao:
   * vinte de trezentos parecem os trezentos.
   */
  listarAuditoria(
    filtros: FiltroAuditoria,
  ): Promise<{ itens: AtendimentoAuditoria[]; total: number }>;

  /**
   * Os numeros do topo da tela e a coluna de vendedoras, numa consulta so.
   * Sem `limit`: e agregacao, e o resultado tem o tamanho da equipe.
   */
  resumoAuditoria(
    filtros: Pick<FiltroAuditoria, 'de' | 'ate' | 'etapa'>,
  ): Promise<ResumoAuditoria>;
}
