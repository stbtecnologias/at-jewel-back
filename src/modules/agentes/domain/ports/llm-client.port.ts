import type { MensagemAgente } from '../entities/conversa.entity';

// Grafico dinamico que a Anastasia pode emitir via tool-use para o painel
// de Analytics renderizar (recharts no front).
export interface GraficoDinamico {
  type: 'bar' | 'line' | 'pie' | 'composed';
  title: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKeys: { key: string; color: string; label: string }[];
}

// Handler injetado pela aplicacao para a tool `registrar_demanda`: recebe
// o input higienizado do modelo e registra a demanda (canal ASSISTENTE),
// devolvendo o id gerado. Mantem o modulo agentes desacoplado da regra de
// negocio de demandas — a implementacao reusa o CriarDemandaUseCase.
export type TipoDemandaLlm = 'RELATORIO' | 'AJUSTE' | 'DUVIDA' | 'OUTRO';

export interface RegistrarDemandaInput {
  tipo: TipoDemandaLlm;
  descricao: string;
}

export type RegistrarDemandaHandler = (
  input: RegistrarDemandaInput,
) => Promise<{ id: string }>;

export interface ChatParams {
  model: string;
  system: string;
  maxTokens: number;
  mensagens: MensagemAgente[];
  // Quando presente, habilita a tool `registrar_demanda` no chatComGrafico.
  registrarDemanda?: RegistrarDemandaHandler;
}

export interface ChatResultado {
  texto: string;
  tokens: number;
}

export interface ChatComGraficoResultado extends ChatResultado {
  grafico?: GraficoDinamico;
}

// Porta que abstrai o provedor de LLM (implementada via @anthropic-ai/sdk na
// infraestrutura). Mantem o dominio/aplicacao livre de tipos do SDK.
export interface ILlmClient {
  chat(params: ChatParams): Promise<ChatResultado>;
  // Variante que habilita a ferramenta gerar_grafico e resolve o ciclo
  // tool_use -> tool_result -> continuacao internamente.
  chatComGrafico(params: ChatParams): Promise<ChatComGraficoResultado>;
}
