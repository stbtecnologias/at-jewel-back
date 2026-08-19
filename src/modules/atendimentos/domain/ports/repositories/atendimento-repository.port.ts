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
}
