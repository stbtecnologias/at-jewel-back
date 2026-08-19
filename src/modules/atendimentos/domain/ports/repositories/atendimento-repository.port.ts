import type {
  DesfechoAtendimento,
  EstadoInteracao,
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
  estado: EstadoInteracao;
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
  estado?: EstadoInteracao;
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

  /** Linha do tempo completa, em ordem cronologica. */
  listarInteracoes(atendimentoId: string): Promise<Interacao[]>;

  /**
   * Interacoes agendadas que ja venceram e ainda nao foram disparadas. E a
   * varredura do agendador — sem filtro de horario comercial: o combinado com
   * o cliente vale como foi dito, inclusive domingo as 21h (decisao do Lucas,
   * 19/08/2026).
   */
  listarVencidas(agora: Date, limite: number): Promise<Interacao[]>;

  atualizarEstadoInteracao(
    id: string,
    estado: EstadoInteracao,
    ocorridoEm?: Date | null,
  ): Promise<void>;
}
