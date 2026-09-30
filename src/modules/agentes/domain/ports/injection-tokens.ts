export const LLM_CLIENT = Symbol('ILlmClient');
export const CONVERSA_REPOSITORY = Symbol('IConversaRepository');
export const AGENTES_DATA_REPOSITORY = Symbol('IAgentesDataRepository');
export const AGENTE_PROMPTS_REPOSITORY = Symbol('IAgentePromptsRepository');
/** Os combinados que a agente nao pode esquecer — ANA-16, 28/09/2026. */
export const COMBINADOS_REPOSITORY = Symbol('ICombinadosRepository');
/**
 * Os lembretes pessoais da gestao — 30/09/2026.
 *
 * Nao confundir com os combinados: combinado vale SEMPRE, em toda conversa;
 * lembrete toca UMA vez, na hora marcada, e vai atras da pessoa.
 */
export const LEMBRETES_REPOSITORY = Symbol('ILembretesRepository');
