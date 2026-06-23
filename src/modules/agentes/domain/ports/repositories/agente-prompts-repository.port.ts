export interface AgentePromptOverride {
  agente: string;
  systemPrompt: string;
  atualizadoEm: Date;
  atualizadoPor: string | null;
}

export interface IAgentePromptsRepository {
  /** System prompt customizado do agente, ou null se usar o padrao do codigo. */
  buscar(agente: string): Promise<string | null>;
  /** Todos os overrides gravados (sem o padrao). */
  buscarTodos(): Promise<AgentePromptOverride[]>;
  /** Cria/atualiza o override do agente. */
  salvar(
    agente: string,
    systemPrompt: string,
    atualizadoPor: string | null,
  ): Promise<void>;
}
