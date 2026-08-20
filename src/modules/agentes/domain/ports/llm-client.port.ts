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

// Handler da tool `consultar_agenda`, do canal INTERNO de WhatsApp.
//
// REPARE NO QUE NAO EXISTE AQUI: nao ha `vendedoraId` no input. A identidade
// vem do telefone resolvido na entrada do canal e fica fechada no handler, por
// closure. O modelo escolhe o PERIODO e mais nada — nao existe parametro para
// "a agenda da Beatriz", entao nenhuma frase alcanca outra vendedora.
export type PeriodoAgendaLlm = 'HOJE' | 'AMANHA' | 'SEMANA';

export interface ConsultarAgendaLlmInput {
  periodo: PeriodoAgendaLlm;
}

export interface CompromissoLlm {
  cliente: string;
  /** Ja formatado ("hoje as 15:00", "sexta as 10:00"). */
  quando: string;
  ocasiao?: string;
}

export interface ConsultarAgendaLlmResultado {
  compromissos: CompromissoLlm[];
}

export type ConsultarAgendaHandler = (
  input: ConsultarAgendaLlmInput,
) => Promise<ConsultarAgendaLlmResultado>;

// Handler da tool `registrar_relato`, do canal INTERNO.
//
// SEM PARAMETROS, de proposito. O relato guardado tem que ser a FRASE DELA, e
// nao o que o modelo entendeu dela — resumo alucina. O handler le a mensagem
// original e entrega ao extrator de sempre. O modelo aqui decide apenas UMA
// coisa: se a mensagem e sobre o contato pendente ou nao.
export interface RegistrarRelatoLlmResultado {
  status: 'SEM_PENDENCIA' | 'NAO_ENTENDI' | 'REGISTRADO';
  /** Frase pronta para o modelo repassar, quando registrou. */
  mensagem: string;
}

export type RegistrarRelatoHandler = () => Promise<RegistrarRelatoLlmResultado>;

// Handlers das tools de desempenho, do canal INTERNO. Mesma regra das
// outras: sem "de quem" no input. O periodo e a unica escolha do modelo.
export type PeriodoVendasLlm = 'HOJE' | 'SEMANA' | 'MES';

export interface ConsultarVendasLlmInput {
  periodo: PeriodoVendasLlm;
}

export interface ConsultarVendasLlmResultado {
  /** Ja formatado ("3 vendas, R$ 12.400,00, ticket medio R$ 4.133,33"). */
  resumo: string;
}

export type ConsultarVendasHandler = (
  input: ConsultarVendasLlmInput,
) => Promise<ConsultarVendasLlmResultado>;

export interface MetaLlm {
  /** Uma linha pronta por meta, com alvo, realizado e quanto falta. */
  linha: string;
}

export interface ConsultarMetasLlmResultado {
  metas: MetaLlm[];
}

export type ConsultarMetasHandler = () => Promise<ConsultarMetasLlmResultado>;

// Handler da tool `consultar_produtos`, do canal INTERNO.
//
// Unica ferramenta do canal que nao e restrita a pessoa: catalogo e da loja.
// O corte aqui e por CAMPO — o resultado nao carrega custo nem margem, entao
// nao ha o que revelar mesmo sob instrucao no meio da conversa.
export interface ConsultarProdutosLlmInput {
  busca: string;
}

export interface ProdutoLlm {
  /** Uma linha pronta: descricao, preco e quantidade. */
  linha: string;
}

export interface ConsultarProdutosLlmResultado {
  produtos: ProdutoLlm[];
}

export type ConsultarProdutosHandler = (
  input: ConsultarProdutosLlmInput,
) => Promise<ConsultarProdutosLlmResultado>;

// Handlers das tools de CARTEIRA, do canal INTERNO. Mesma regra: sem "de
// quem" no input — o codigo da vendedora entra por closure.
export interface ClienteDaCarteiraLlm {
  /** Uma linha pronta: nome, ultima compra, quanto/quantas vezes. */
  linha: string;
}

export interface ConsultarCarteiraLlmResultado {
  clientes: ClienteDaCarteiraLlm[];
}

export type ClientesSemComprarHandler = (input: {
  meses: number;
}) => Promise<ConsultarCarteiraLlmResultado>;

export type MelhoresClientesHandler = (input: {
  categoria?: string;
  ultimosMeses?: number;
}) => Promise<ConsultarCarteiraLlmResultado>;

export interface ChatParams {
  model: string;
  system: string;
  maxTokens: number;
  mensagens: MensagemAgente[];
  // Quando presente, habilita a tool `registrar_demanda` no chatComFerramentas.
  registrarDemanda?: RegistrarDemandaHandler;
  // Idem para `avisar_vendedora`.
  avisarVendedora?: AvisarVendedoraHandler;
  // Idem para `consultar_agenda` — canal interno da vendedora.
  consultarAgenda?: ConsultarAgendaHandler;
  // Idem para `registrar_relato` — canal interno da vendedora.
  registrarRelato?: RegistrarRelatoHandler;
  // Idem para `consultar_vendas` e `consultar_metas`.
  consultarVendas?: ConsultarVendasHandler;
  consultarMetas?: ConsultarMetasHandler;
  // Idem para `consultar_produtos`.
  consultarProdutos?: ConsultarProdutosHandler;
  // Idem para as duas de carteira.
  clientesSemComprar?: ClientesSemComprarHandler;
  melhoresClientes?: MelhoresClientesHandler;
  /**
   * Habilita `gerar_grafico`. Default true, que preserva o painel.
   *
   * O canal de WhatsApp passa `false`: nao ha onde renderizar grafico numa
   * conversa, e oferecer a ferramenta so convida o modelo a tentar.
   */
  graficos?: boolean;
}

export interface ChatResultado {
  texto: string;
  tokens: number;
}

export interface ChatComFerramentasResultado extends ChatResultado {
  grafico?: GraficoDinamico;
}

// Porta que abstrai o provedor de LLM (implementada via @anthropic-ai/sdk na
// infraestrutura). Mantem o dominio/aplicacao livre de tipos do SDK.
export interface ILlmClient {
  chat(params: ChatParams): Promise<ChatResultado>;
  // Variante que habilita a ferramenta gerar_grafico e resolve o ciclo
  // tool_use -> tool_result -> continuacao internamente.
  chatComFerramentas(params: ChatParams): Promise<ChatComFerramentasResultado>;
}
