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

// Handler da tool `avisar_vendedora`. Recebe o que o modelo extraiu da
// conversa e devolve um resultado FECHADO — a identidade da vendedora e
// resolvida no servidor, a partir da carteira do cliente, e nunca chega aqui
// vinda do texto. O retorno nao carrega telefone.
export interface AvisarVendedoraLlmInput {
  cliente: string;
  assunto?: string;
  quando?: string;
  /** O mesmo horario em ISO 8601 — e o que permite agendar. */
  quandoIso?: string;
  ocasiao?: string;
}

export type StatusAvisoLlm =
  | 'ENVIADO'
  | 'COMPLEMENTADO'
  | 'CLIENTE_NAO_ENCONTRADO'
  | 'CLIENTE_AMBIGUO'
  | 'SEM_VENDEDORA'
  | 'VENDEDORA_NAO_ENCONTRADA'
  | 'VENDEDORA_SEM_WHATSAPP'
  | 'NUMERO_SEM_WHATSAPP'
  | 'FALHA_ENVIO';

export interface AvisarVendedoraLlmResultado {
  status: StatusAvisoLlm;
  /** Frase pronta para o modelo repassar ao ADM. Sem dado sensivel. */
  mensagem: string;
}

export type AvisarVendedoraHandler = (
  input: AvisarVendedoraLlmInput,
) => Promise<AvisarVendedoraLlmResultado>;

export interface ChatParams {
  model: string;
  system: string;
  maxTokens: number;
  mensagens: MensagemAgente[];
  // Quando presente, habilita a tool `registrar_demanda` no chatComGrafico.
  registrarDemanda?: RegistrarDemandaHandler;
  // Idem para `avisar_vendedora`.
  avisarVendedora?: AvisarVendedoraHandler;
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
