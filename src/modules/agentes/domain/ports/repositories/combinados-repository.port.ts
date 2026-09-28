/** Um combinado guardado, como ele volta do banco. */
export interface Combinado {
  id: string;
  agente: string;
  texto: string;
  criadoEm: Date;
  /** Quem combinou. `null` quando o usuario foi removido depois. */
  criadoPorId: string | null;
}

export interface ICombinadosRepository {
  /**
   * Os combinados ATIVOS de uma agente, do mais antigo para o mais novo.
   *
   * A ORDEM E A DE QUEM CHEGOU PRIMEIRO, e nao a inversa: eles entram no
   * system prompt como uma lista, e quem combinou primeiro espera que o dela
   * continue valendo. Inverter faria a lista mudar de cara a cada combinado
   * novo, e a pessoa nao reconheceria a propria instrucao na tela do ANA-18.
   */
  listarAtivos(agente: string): Promise<Combinado[]>;

  /** Guarda um combinado novo. Devolve o que ficou gravado. */
  guardar(
    agente: string,
    texto: string,
    criadoPorId: string | null,
  ): Promise<Combinado>;

  /**
   * Remocao LOGICA — a linha fica.
   *
   * Devolve `false` quando o id nao existe ou ja estava removido, e quem chama
   * usa isso para nao dizer "pronto, esqueci" sobre algo que nao esqueceu.
   */
  remover(id: string, removidoPorId: string | null): Promise<boolean>;

  /** Quantos ativos a agente tem. Serve ao teto — ver `GuardarCombinadoUseCase`. */
  contarAtivos(agente: string): Promise<number>;
}
