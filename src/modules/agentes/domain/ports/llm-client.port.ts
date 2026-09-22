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

// Handler da tool `consultar_minha_carteira`, do canal INTERNO.
//
// SEM PARAMETRO NENHUM, e isso e a regra do canal e nao economia: nao existe
// "de quem". O `vendedoraId` entra por closure, vindo do telefone, entao
// nenhuma frase alcanca a carteira de outra pessoa. Decisao do Lucas em
// 21/09/2026: "cada vendedora ve apenas as suas coisas".
export interface CarteiraAgoraLlmResultado {
  /** Clientes com atendimento EM CURSO agora — nao e o total historico. */
  total: number;
  /** Uma linha pronta por etapa que tenha pelo menos um cliente. */
  linhas: string[];
  /**
   * Quantos desses esperam o relato DELA.
   *
   * E o numero que muda o dia: a distribuicao diz como esta a carteira, este
   * diz o que esta parado esperando ela.
   */
  aguardandoRelato: number;
}

export type ConsultarCarteiraAgoraHandler =
  () => Promise<CarteiraAgoraLlmResultado>;

// Handler da tool `meus_leads`, do canal INTERNO.
//
// SEM "DE QUEM", como todas as dela: o codigo da vendedora entra por closure.
// Decisao do Lucas em 21/09/2026: "a vendedora recebe apenas o que foi
// encaminhado para ela".
//
// O TELEFONE VAI, e aqui ele TEM de ir — e o mesmo motivo do aviso de
// encaminhamento: sem o numero, "entre em contato" nao tem como ser cumprido.
export interface MeusLeadsLlmResultado {
  /** `SEM_CODIGO`: o cadastro dela nao tem codigo, e o filtro nao existe. */
  status: 'OK' | 'SEM_CODIGO';
  /** Uma linha pronta por lead, com telefone. */
  linhas: string[];
  /** QUANTOS existem, e nao quantos vieram — o teto nao pode mentir. */
  total: number;
}

export type ConsultarMeusLeadsHandler =
  () => Promise<MeusLeadsLlmResultado>;

/**
 * A VENDEDORA DA BAIXA NO LEAD — 22/09/2026.
 *
 * ==========================================================================
 * SEM "DE QUEM", como todas as dela — e aqui a ausencia protege ESCRITA, e
 * nao so leitura.
 *
 * Nas outras ferramentas dela, um "de quem" vazaria dados de outra vendedora.
 * Nesta, ele deixaria uma vendedora ESCREVER no lead de outra. O codigo dela
 * entra por closure, e o use case ainda confere se o lead foi mesmo
 * encaminhado para ela antes de tocar em qualquer coisa.
 *
 * O `lead` e o NOME como ela escreveu, e nao um id: ela acabou de ver a lista,
 * e pedir um uuid no WhatsApp seria pedir o impossivel.
 * ==========================================================================
 */
export type StatusLeadLlm =
  | 'NOVO'
  | 'EM_CONTATO'
  | 'VIROU_CLIENTE'
  | 'NAO_VINGOU';

export interface AtualizarLeadLlmInput {
  /** O nome do lead como ela falou. Casa frouxo com a lista dela. */
  lead: string;
  status: StatusLeadLlm;
  /** A frase dela. Ausente nao apaga a que ja estava gravada. */
  observacao?: string;
}

export interface AtualizarLeadLlmResultado {
  /**
   * `NAO_ACHEI` cobre tambem o lead de outra vendedora, de proposito — a
   * mesma frase de nome errado. Dizer "esse e de outra" ja entregaria que ele
   * existe, e e a regra que vale no resto do canal dela.
   */
  status: 'ATUALIZADO' | 'NAO_ACHEI' | 'SEM_CODIGO';
  /** Frase pronta para o modelo repassar, com o VEREDITO na frente. */
  mensagem: string;
}

export type AtualizarLeadHandler = (
  input: AtualizarLeadLlmInput,
) => Promise<AtualizarLeadLlmResultado>;

// Handlers das tools de CARTEIRA, do canal INTERNO. Mesma regra: sem "de
// quem" no input — o codigo da vendedora entra por closure.
export interface ClienteDaCarteiraLlm {
  /** Uma linha pronta: nome, ultima compra, quanto/quantas vezes. */
  linha: string;
}

export interface ConsultarCarteiraLlmResultado {
  /** A AMOSTRA — no maximo dez. Carteira grande nao cabe em mensagem. */
  clientes: ClienteDaCarteiraLlm[];
  /**
   * QUANTOS atendem ao criterio, e nao quantos vieram na amostra.
   *
   * Sem este numero o teto MENTE POR OMISSAO: dez de trezentos parecem os
   * trezentos, e quem le vai embora com a impressao errada. Com ele, a
   * agente diz "dez dos trezentos" e oferece refinar.
   */
  total: number;
}

export type ClientesSemComprarHandler = (input: {
  meses: number;
}) => Promise<ConsultarCarteiraLlmResultado>;

export type MelhoresClientesHandler = (input: {
  categoria?: string;
  ultimosMeses?: number;
}) => Promise<ConsultarCarteiraLlmResultado>;

// Handler da tool `agendar_contato`, do canal INTERNO. UNICA ferramenta do
// canal que ESCREVE — por isso o resultado e fechado, com um status por
// caminho, e a frase de volta e montada pelo servidor.
export type StatusAgendamentoLlm =
  | 'AGENDADO'
  | 'CLIENTE_NAO_ENCONTRADO'
  | 'CLIENTE_AMBIGUO'
  | 'HORARIO_INVALIDO'
  | 'ATENDIMENTO_DE_OUTRA_PESSOA'
  /**
   * O NOME E UM LEAD DELA, E NAO UM CLIENTE — 22/09/2026.
   *
   * ======================================================================
   * SEPARADO DE `CLIENTE_NAO_ENCONTRADO` DE PROPOSITO.
   *
   * As duas respostas seriam "nao achei", e para a vendedora elas nao sao a
   * mesma coisa: o lead ela ACABOU DE VER na lista, com nome e telefone. Uma
   * negativa seca ali parece defeito do sistema, e ela insiste.
   *
   * Nao ha vazamento: o lead ja e dela, e a frase so repete o que a propria
   * lista dela mostrou. E o oposto do caso do cliente de outra carteira, onde
   * a negativa e generica justamente para nao revelar que ele existe.
   * ======================================================================
   */
  | 'E_LEAD';

export interface AgendarContatoLlmInput {
  cliente: string;
  /** Horario em ISO 8601 com fuso, calculado a partir da data de hoje. */
  quandoIso: string;
}

export interface AgendarContatoLlmResultado {
  status: StatusAgendamentoLlm;
  /** Frase pronta para o modelo repassar. Sem dado de terceiros. */
  mensagem: string;
}

export type AgendarContatoHandler = (
  input: AgendarContatoLlmInput,
) => Promise<AgendarContatoLlmResultado>;

// ===========================================================================
// GESTAO — o espelho das ferramentas da vendedora, COM o parametro "de quem".
//
// SAO TIPOS SEPARADOS, e nao um parametro opcional nos handlers da vendedora.
// A diferenca e a coisa toda: se `consultarAgenda` aceitasse um `vendedora?`,
// bastaria o modelo preencher esse campo no canal dela para o escopo cair. Aqui
// nao ha o que preencher — o canal da vendedora recebe handlers que nao tem o
// parametro, e o da gestao recebe outros. A separacao e por AUSENCIA DE
// CAMINHO, nao por regra de prompt.
// ===========================================================================

/**
 * Resposta comum das leituras de gestao.
 *
 * Carrega o resultado da RESOLUCAO DO NOME junto com os dados, porque as duas
 * coisas chegam ao modelo pelo mesmo caminho: "achei a Marina e a agenda dela e
 * esta" ou "tem duas Marinas, pergunte qual". Sem isso o modelo teria que
 * adivinhar o que aconteceu a partir de uma lista vazia.
 */
export interface GestaoLeituraResultado {
  status: 'OK' | 'NAO_ENCONTRADA' | 'AMBIGUA';
  /** Nome como esta cadastrado, quando resolveu. */
  vendedora?: string;
  /** Uma linha pronta por item. Vazio e resultado legitimo: nao ha nada. */
  linhas: string[];
  /** Nomes para desambiguar (AMBIGUA) ou sugerir (NAO_ENCONTRADA). */
  nomes?: string[];
}

export type GestaoAgendaHandler = (input: {
  vendedora: string;
  periodo: PeriodoAgendaLlm;
}) => Promise<GestaoLeituraResultado>;

export type GestaoVendasHandler = (input: {
  vendedora: string;
  periodo: PeriodoVendasLlm;
}) => Promise<GestaoLeituraResultado>;

export type GestaoMetasHandler = (input: {
  vendedora: string;
}) => Promise<GestaoLeituraResultado>;

/** Comparativo da equipe inteira — nao resolve nome, entao nao tem status. */
/**
 * A carteira de UMA vendedora, vista pela gestao.
 *
 * Reusa o `GestaoLeituraResultado` das outras leituras — mesma forma, mesmo
 * tratamento de nome ambiguo. O `total` entra porque carteira e a consulta que
 * mais estoura: mil clientes nao cabem numa mensagem, e dez sem o total
 * pareceriam os mil.
 */
export type GestaoCarteiraHandler = (input: {
  vendedora: string;
  /** Meses sem comprar. Default 6. */
  meses?: number;
}) => Promise<GestaoLeituraResultado & { total?: number }>;

export type GestaoMelhoresHandler = (input: {
  vendedora: string;
  categoria?: string;
  ultimosMeses?: number;
}) => Promise<GestaoLeituraResultado & { total?: number }>;

export type GestaoPanoramaHandler = (input: {
  periodo: PeriodoVendasLlm;
}) => Promise<{ linhas: string[] }>;

/**
 * De quem e este cliente. EXCLUSIVA DA GESTAO — e literalmente a pergunta que
 * a vendedora nao pode fazer (ver ELENA_INTERNA_SYSTEM).
 */
/**
 * "Que leads estao esperando encaminhamento?"
 *
 * A IDADE VAI EM CADA LINHA, e e a informacao que justifica a ferramenta.
 * Uma lista de nomes diz quem esta na fila; a idade diz QUEM ESTA PARADO —
 * e lead esquecido nao gera aviso nenhum, porque o aviso sai uma vez so.
 *
 * SEM TELEFONE, igual ao aviso: o ADM nao liga para ninguem, e o numero
 * solto numa lista so serviria para ser repassado adiante sem controle.
 */
export type GestaoLeadsHandler = () => Promise<{ linhas: string[] }>;

/**
 * "Quais sao as minhas vendedoras?" — a pergunta que o aviso de lead provoca.
 *
 * Devolve UMA LINHA POR VENDEDORA, ja pronta para ser repassada. O status
 * vem junto porque a pergunta real e "para quem eu posso mandar agora", e
 * uma lista sem isso convida a encaminhar para quem esta de ferias.
 */
export type GestaoVendedorasHandler = () => Promise<{ linhas: string[] }>;

/**
 * "Manda pro Thiago" — a resposta ao aviso de lead novo.
 *
 * O RESULTADO E FECHADO, e nao um texto livre: quem transforma status em
 * frase e o cliente do LLM, para a Anastasia nunca improvisar sobre um erro
 * que ela nao entende. Nenhuma variante carrega telefone de cliente.
 */
export type GestaoEncaminharLeadHandler = (input: {
  vendedora: string;
  lead?: string;
  /** Horario combinado em texto livre. Vai como RECADO, nao vira agenda. */
  quando?: string;
}) => Promise<{
  status: string;
  leadNome?: string;
  vendedoraNome?: string;
  termo?: string;
  nomes?: string[];
  sugestoes?: string[];
}>;

export type GestaoCarteiraDoClienteHandler = (input: {
  cliente: string;
}) => Promise<{
  status: 'OK' | 'NAO_ENCONTRADO' | 'AMBIGUO';
  linhas: string[];
}>;

/**
 * O QUE A VENDEDORA CONTOU sobre os atendimentos dela. EXCLUSIVA DA GESTAO.
 *
 * Devolve o texto INTEGRAL do relato — decisao do Lucas em 24/08/2026: o
 * relato E o feedback, e quem escreve responde pelo que escreve. Isso
 * significa que a frase dela viaja para a API do modelo a cada pergunta, e a
 * ferramenta so existe no canal da gestao por causa disso.
 *
 * Com `cliente`, traz o episodio daquele cliente inteiro. Sem, traz os
 * ultimos feedbacks dela no periodo, com teto — e o `total` junto, porque dez
 * de trinta pareceriam os trinta.
 */
/**
 * O DIA DE UMA VENDEDORA numa frase — "como esta o canal da Marina hoje".
 *
 * NAO le o WhatsApp dela: le o REGISTRO do que passou por ele. Os numeros
 * sao exatos e custam uma consulta; dizer O QUE a cliente quer exigiria ler
 * o texto das conversas, que e outra frente.
 */
export type GestaoDiaDaVendedoraHandler = (input: {
  vendedora: string;
  /** `YYYY-MM-DD`. Sem ele, hoje. NAO recua para um dia com movimento. */
  dia?: string;
}) => Promise<GestaoLeituraResultado>;

/**
 * O FUNIL AGORA, pela gestao — o espelho de `consultar_minha_carteira`.
 *
 * Com `vendedora`, a carteira daquela pessoa. SEM ela, a loja inteira, e ai
 * as linhas trazem tambem uma por vendedora. E a assimetria de sempre: aqui o
 * "de quem" existe porque quem pergunta e a administracao.
 */
/**
 * O PANORAMA DE LEADS, pela gestao — o espelho de `meus_leads`.
 *
 * Com `vendedora`, os leads daquela pessoa, com telefone e tudo. SEM ela, a
 * fila inteira: quantos em cada estado, quem esta esperando encaminhamento e
 * quantos foram para cada vendedora.
 *
 * A GESTAO VE TUDO — decisao do Lucas em 21/09/2026. O AVISO que sai sozinho
 * continua sem telefone (ninguem pediu por ele); quando o ADM PERGUNTA, ele
 * recebe o dado completo.
 */
export type GestaoPanoramaLeadsHandler = (input: {
  /** Nome (ou parte). Ausente = a fila inteira. */
  vendedora?: string;
}) => Promise<GestaoLeituraResultado & { total?: number }>;

export type GestaoFunilHandler = (input: {
  /** Nome (ou parte). Ausente = a loja inteira. */
  vendedora?: string;
}) => Promise<GestaoLeituraResultado & { total?: number }>;

export type GestaoFeedbacksHandler = (input: {
  vendedora: string;
  /** Nome (ou parte) do cliente. Restringe a UM episodio. */
  cliente?: string;
  /** Janela em dias sobre a abertura do atendimento. Default 7. */
  dias?: number;
}) => Promise<GestaoLeituraResultado & { total?: number }>;

/**
 * Agendar pela gestao. Diferente do `AgendarContatoHandler` da vendedora em
 * duas coisas: aceita PARA QUEM, e pode voltar SEM TER ESCRITO NADA quando o
 * cliente e de outra carteira e ninguem decidiu o que fazer.
 *
 * O `modo` chega na SEGUNDA chamada, depois de a pessoa responder. Quem
 * relembra os outros parametros e a memoria de conversa — por isso nao ha
 * ferramenta separada de confirmacao, nem estado guardado no servidor.
 */
export type GestaoAgendarHandler = (input: {
  cliente: string;
  vendedora: string;
  quandoIso: string;
  modo?: 'OCASIONAL' | 'TRANSFERIR';
}) => Promise<{ mensagem: string }>;

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
  // Idem para `consultar_minha_carteira`.
  consultarCarteiraAgora?: ConsultarCarteiraAgoraHandler;
  // Idem para `meus_leads`.
  consultarMeusLeads?: ConsultarMeusLeadsHandler;
  // Idem para `atualizar_lead` — a UNICA escrita dela sobre lead.
  atualizarLead?: AtualizarLeadHandler;
  // Idem para as duas de carteira.
  clientesSemComprar?: ClientesSemComprarHandler;
  melhoresClientes?: MelhoresClientesHandler;
  // Idem para `agendar_contato` — a unica que escreve.
  agendarContato?: AgendarContatoHandler;
  // Canal da GESTAO. Nunca convivem com os de cima: quem monta os handlers e o
  // use case, e cada canal monta so o seu conjunto.
  gestaoAgenda?: GestaoAgendaHandler;
  gestaoVendas?: GestaoVendasHandler;
  gestaoMetas?: GestaoMetasHandler;
  gestaoPanorama?: GestaoPanoramaHandler;
  gestaoCarteiraDoCliente?: GestaoCarteiraDoClienteHandler;
  gestaoEncaminharLead?: GestaoEncaminharLeadHandler;
  gestaoVendedoras?: GestaoVendedorasHandler;
  gestaoLeads?: GestaoLeadsHandler;
  gestaoCarteira?: GestaoCarteiraHandler;
  gestaoMelhores?: GestaoMelhoresHandler;
  gestaoAgendar?: GestaoAgendarHandler;
  gestaoFeedbacks?: GestaoFeedbacksHandler;
  gestaoDiaDaVendedora?: GestaoDiaDaVendedoraHandler;
  gestaoFunil?: GestaoFunilHandler;
  gestaoPanoramaLeads?: GestaoPanoramaLeadsHandler;
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
