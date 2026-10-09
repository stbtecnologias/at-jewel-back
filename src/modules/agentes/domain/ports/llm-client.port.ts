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

/**
 * O que ela pergunta sobre as PROPRIAS vendas.
 *
 * Ganhou `de`/`ate` em 28/09/2026, pelo mesmo motivo do lado da gestao: ela
 * perguntou "e no ano?" e ouviu "nao consigo puxar por ano, so tenho hoje,
 * ultimos sete dias e ultimos trinta dias". O `ConsultarVendasUseCase` sabe
 * responder por ANO e por datas soltas desde 25/09 — a ferramenta e que nao
 * deixava pedir.
 */
export interface ConsultarVendasLlmInput extends Pick<RecorteDeTempo, 'de' | 'ate'> {
  periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
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
  /**
   * So quando ela PEDE o que nao tem em estoque. Sem isto, a consulta
   * devolve apenas o disponivel — decisao do Lucas em 07/10/2026.
   *
   * O codigo exato passa por fora dos dois jeitos: `An24084` acha a peca com
   * ou sem saldo, e sem precisar deste campo.
   */
  incluirSemEstoque?: boolean;
  /**
   * A categoria vinda da PERGUNTA. Vazio significa o padrao — joia —, e nao
   * "sem filtro": ver `categoriaDaBusca`.
   */
  categoria?: string;
  /**
   * A faixa de preco da pergunta. `unknown` porque o modelo manda texto: a
   * leitura e a correcao ficam em `faixaDePreco`.
   */
  precoDe?: unknown;
  precoAte?: unknown;
  /** Quantas pular — a continuacao da lista. Ver `faixaDaLista`. */
  aPartirDe?: number;
  /**
   * Mandar as fotos junto? Decisao do Lucas em 07/10: a foto VEM, e so nao
   * vem quando ela pedir so o texto. Entao o padrao e `true`.
   */
  comFoto?: boolean;
  /** So as que TEM foto conferida — muda a lista, nao so o anexo. */
  soComFoto?: boolean;
}

export interface ProdutoLlm {
  /** Uma linha pronta: descricao, preco e quantidade. */
  linha: string;
}

export interface ConsultarProdutosLlmResultado {
  produtos: ProdutoLlm[];
  /** Quantas o filtro acha de verdade — `produtos` e so o comeco da lista. */
  total: number;
  /**
   * Quantas EXISTEM no catalogo e ficaram de fora por nao ter saldo.
   *
   * E o numero que impede a resposta confiante e errada: sem ele, "nao achei
   * nenhum brinco de diamante" sai no lugar de "achei 22, nenhuma em estoque".
   */
  semEstoque: number;
  /**
   * A lista JA traz as zeradas?
   *
   * Muda a frase inteira: com a lista filtrada, `semEstoque` e o que ficou de
   * FORA; com ela aberta, e quantas das que estao ali nao tem saldo.
   */
  incluiuSemEstoque: boolean;
  /** Em que categoria a lista esta. Vazio = sem recorte (TODAS). */
  categoria?: string;
  /** Quantas casam com o termo e ficaram de fora POR CAUSA da categoria. */
  foraDaCategoria: number;
  /** A faixa de preco aplicada, ja lida e corrigida. */
  faixa?: { de?: number; ate?: number };
  /** Quantas foram puladas antes desta pagina. */
  pulados?: number;
  /** As fotos que EXISTEM, ja baixadas. Vazio e o caso comum na joia. */
  fotos?: FotoDeProdutoLlm[];
  /** Quantas pecas da lista tinham URL de foto cadastrada. */
  tinhamFoto?: number;
  /** A lista inteira e so de pecas com foto conferida? */
  soComFoto?: boolean;
  /** Candidatas que ficaram sem conferir por causa do teto. */
  naoConferidas?: number;
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
  /**
   * QUEM SAO — 08/10/2026, e nasceu de um teste em producao.
   *
   * ========================================================================
   * A AGENTE DIZIA O NUMERO E MANDAVA ELA OLHAR NO PAINEL.
   *
   * Conversa da Nathalia com a Helena, 08/10 as 11:21, em PRODUCAO:
   *
   *   — "Quem sao as clientes em negociacao?"
   *   — "Aqui o sistema so me da o numero — sao 5 clientes em negociacao,
   *      mas sem os nomes. Pra ver quem sao (...) o melhor caminho e voce
   *      olhar direto no seu funil de atendimento."
   *
   * E a agente estava certa sobre a ferramenta: ela chamava o `resumo`, que
   * e AGREGADO. Mas o dado existia a um metodo de distancia — o
   * `listarAuditoria` devolve `clienteNome`, etapa, desde quando esta
   * aberto, se espera relato e o ultimo relato dela.
   *
   * O custo disso e alto e nao aparece como erro: a propria agente acabara
   * de dizer que aqueles cinco eram "o foco mais imediato", e a conversa
   * terminou mandando a vendedora para outra tela. O passo seguinte do
   * trabalho dela ficou fora do canal.
   * ========================================================================
   */
  clientes: string[];
  /**
   * Quantos existem, quando a lista foi cortada pelo teto.
   *
   * `undefined` quando veio tudo. Teto que nao se anuncia faz cinco de
   * trinta parecerem os trinta — o mesmo motivo do `total` em toda lista
   * desta casa.
   */
  clientesOcultos?: number;
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
  /** A PAGINA — no maximo vinte. Carteira grande nao cabe em mensagem. */
  clientes: ClienteDaCarteiraLlm[];
  /** Quantos foram pulados para montar esta pagina. Zero na primeira. */
  aPartirDe?: number;
  /**
   * QUANTOS atendem ao criterio, e nao quantos vieram na amostra.
   *
   * Sem este numero o teto MENTE POR OMISSAO: dez de trezentos parecem os
   * trezentos, e quem le vai embora com a impressao errada. Com ele, a
   * agente diz "dez dos trezentos" e oferece refinar.
   */
  total: number;
}

/**
 * TRES FORMAS DE DIZER O MESMO RECORTE — 01/10/2026.
 *
 * So `meses` existia, e era obrigatorio: "ha 45 dias" e "desde julho" nao
 * tinham como chegar. Todos opcionais agora, e sem nenhum o padrao e seis
 * meses — o mesmo de antes.
 */
export type ClientesSemComprarHandler = (input: {
  meses?: number;
  dias?: number;
  /** `AAAA-MM-DD`. Vence os outros dois: e a forma mais especifica. */
  desde?: string;
  /**
   * Quantos PULAR — a continuacao da lista, desde 05/10/2026.
   *
   * Nao e "numero da pagina": e quantos ja foram mostrados. O modelo le
   * "estes sao o 1o ao 20o de 97" e pede os proximos com 20, sem precisar
   * saber o tamanho da pagina, que e detalhe nosso.
   */
  aPartirDe?: number;
}) => Promise<ConsultarCarteiraLlmResultado>;

/**
 * Quem compra NAQUELA EPOCA, somando todos os anos — 01/10/2026.
 *
 * Um dos dois campos, nunca os dois: mes OU data comemorativa. Sem nenhum a
 * pergunta nao ficou de pe, e o handler devolve vazio em vez de responder
 * outra coisa.
 */
export type ClientesPorEpocaHandler = (input: {
  mes?: number;
  dataComemorativa?: string;
}) => Promise<ConsultarCarteiraLlmResultado>;

export type MelhoresClientesHandler = (input: {
  categoria?: string;
  ultimosMeses?: number;
}) => Promise<ConsultarCarteiraLlmResultado>;

/**
 * OS CLIENTES OURO, PRATA E BRONZE — 09/10/2026.
 *
 * ==========================================================================
 * A MESMA PALAVRA QUE O PAINEL USA, E O MESMO NUMERO.
 *
 * O cartao "Clientes Ouro" da tela de Clientes ja dizia QUANTOS. A gestora
 * pediu QUEM, e a regra do nivel sai de `shared/clientes/fidelidade.ts`, de
 * onde o SQL do cartao tambem sai desde hoje. Dois numeros para a mesma
 * palavra seria pior do que nao ter a ferramenta.
 * ==========================================================================
 */
export interface FidelidadeLlmResultado {
  /** Linhas prontas: nome, nivel, compras, valor liquido, ultima compra. */
  linhas: string[];
  /** Quantos atendem ao recorte — nao quantos vieram. */
  total: number;
  /** Quantos foram pulados para montar esta pagina. */
  deslocamento: number;
  /**
   * Quantos do recorte NAO tem vendedora na carteira.
   *
   * Vai ao modelo de proposito: medido em 09/10, 19 dos 48 clientes Ouro nao
   * tem dona. Sem este numero, "os Ouro de cada vendedora" somaria 29 e a
   * resposta pareceria completa.
   */
  semVendedora: number;
  /** O corte em palavras — "6 compras ou mais". Para ela nao chutar o numero. */
  cortes: string;
  /**
   * O nivel pedido nao existe.
   *
   * O modelo escreve o valor do enum e pode escrever "Diamante". Filtrar por
   * nivel inexistente devolveria lista vazia, e vazio e indistinguivel de
   * "nao ha nenhum" — a forma de erro mais cara deste projeto.
   */
  nivelDesconhecido?: boolean;
}

/** Da VENDEDORA: so a carteira dela, e sem parametro de escopo nenhum. */
export type ClientesPorFidelidadeHandler = (input: {
  nivel?: string;
  mesesSemComprar?: number;
  aPartirDe?: number;
}) => Promise<FidelidadeLlmResultado>;

/**
 * Da GESTAO: a loja inteira, ou uma vendedora quando ela disser o nome.
 *
 * `vendedora` e OPCIONAL aqui, ao contrario das outras ferramentas de gestao:
 * "me lista os clientes Ouro" e uma pergunta da LOJA, e exigir o nome faria o
 * modelo inventar um.
 */
export type GestaoFidelidadeHandler = (input: {
  nivel?: string;
  vendedora?: string;
  mesesSemComprar?: number;
  aPartirDe?: number;
}) => Promise<
  FidelidadeLlmResultado & {
    /** 'OK' | 'AMBIGUA' | 'NAO_ENCONTRADA' — so quando veio nome. */
    status?: string;
    /** As candidatas, quando o nome ficou ambiguo. */
    nomes?: string[];
    /** O nome resolvido, para a resposta citar de quem e a lista. */
    vendedora?: string;
  }
>;

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

/**
 * A agenda de UMA vendedora — ou da equipe inteira, quando o nome nao vem.
 *
 * A mesma assimetria de `funil_de_atendimentos` e `panorama_de_leads`: o "de
 * quem" so existe porque quem pergunta e a administracao, e "sem nome" nao e
 * falta de dado, e o pedido pela equipe.
 */
export type GestaoAgendaHandler = (input: {
  /** OMITIDO = a equipe inteira (a da gerente, quando houver recorte). */
  vendedora?: string;
  periodo: PeriodoAgendaLlm;
}) => Promise<GestaoLeituraResultado>;

/**
 * O RECORTE DE TEMPO DE UMA PERGUNTA DE VENDA — 28/09/2026.
 *
 * ==========================================================================
 * O ATALHO **OU** AS DATAS, E FOI O SEGUNDO QUE FALTAVA.
 *
 * Ate hoje as ferramentas de venda so aceitavam o enum. O Lucas perguntou "o
 * que a Camila mais vendeu nos ultimos 6 meses" e recebeu:
 *
 *   "Nao da para escolher exatamente seis meses — as opcoes sao hoje,
 *    ontem, semana, mes ou ano."
 *
 * Uma recusa por limitacao NOSSA, numa pergunta que o banco responde sem
 * esforco: o `ConsultarVendasUseCase` ja tinha `resumoEntre`, `itensEntre` e
 * `rankingEntre` desde 25/09, prontos e sem ninguem chamando.
 *
 * QUEM CALCULA AS DATAS E O MODELO, e isso ja e pratica aqui: o system prompt
 * diz que horas sao agora, e e assim que ele converte "amanha as 17h" para
 * agendar. "Ultimos 6 meses" e a mesma conta.
 *
 * O ATALHO NAO SAIU, e nao e redundancia: `MES` e `ANO` sao o mes e o ano do
 * CALENDARIO, que e o que se compara com a meta. O modelo calculando "o mes"
 * chutaria trinta dias para tras e daria um numero que nao bate com nada que
 * a gestao acompanha.
 * ==========================================================================
 */
export interface RecorteDeTempo {
  /**
   * O atalho. Ignorado quando `de` e `ate` vem preenchidos.
   *
   * ONTEM e ANO entraram em 28/09/2026: o `ConsultarVendasUseCase` sempre
   * respondeu os cinco, e eram os TIPOS que andavam mais estreitos que ele.
   */
  periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
  /** Inicio, `AAAA-MM-DD`. So vale junto com `ate`. */
  de?: string;
  /** Fim, `AAAA-MM-DD`, INCLUSIVE — o dia inteiro conta. */
  ate?: string;
}

export type GestaoVendasHandler = (
  input: { vendedora: string } & RecorteDeTempo,
) => Promise<GestaoLeituraResultado>;

export type GestaoMetasHandler = (input: {
  vendedora: string;
}) => Promise<GestaoLeituraResultado>;

/**
 * OS COMBINADOS — ANA-16 e ANA-18, 28/09/2026.
 *
 * Tres verbos porque sao tres coisas que a equipe faz com eles: combinar,
 * conferir o que ja combinou e desfazer. O documento pede os tres ("ver e
 * corrigir as instrucoes que a Anastasia guardou").
 */
/**
 * QUEM MAIS VENDE UM TIPO DE PECA — 28/09/2026.
 *
 * A pergunta do Lucas: "qual a vendedora que mais vende brinco?". Nenhuma das
 * ferramentas respondia — o ranking somava tudo sem separar tipo, e os itens
 * separavam tipo sem agrupar por quem vendeu.
 */
export type GestaoPorFamiliaHandler = (
  input: {
    familia: string;
    limite?: number;
    /**
     * 1 a 12 — "esse mes, em TODOS os anos".
     *
     * Quando vem, manda em tudo: nao e uma janela `de`/`ate`, e sim um corte
     * que atravessa os anos, e a resposta vem quebrada por ano. Ver
     * `rankingPorFamiliaNoMes`.
     */
    mes?: number;
  } & RecorteDeTempo,
) => Promise<{
  status: 'OK' | 'FAMILIA_DESCONHECIDA';
  linhas: string[];
  /** As familias que existem, quando o nome nao casou. */
  familias?: string[];
}>;

export type GuardarCombinadoHandler = (input: {
  texto: string;
}) => Promise<{ status: 'OK' | 'VAZIO' | 'LONGO' | 'CHEIO'; teto?: number }>;

export type ListarCombinadosHandler = () => Promise<{
  /** Uma linha por combinado, ja numerada — e o numero serve ao esquecer. */
  linhas: string[];
}>;

export type EsquecerCombinadoHandler = (input: {
  /** A posicao na lista que `listar_combinados` mostrou, comecando em 1. */
  numero: number;
}) => Promise<{ status: 'OK' | 'NAO_ACHEI'; texto?: string }>;

/**
 * OS LEMBRETES PESSOAIS — 30/09/2026.
 *
 * ==========================================================================
 * TRES DELES DEVOLVEM `mensagem` PRONTA, e nao um status para o cliente do
 * LLM traduzir.
 *
 * E a forma do `agendar_para_vendedora`, e pelo mesmo motivo: a frase depende
 * de coisas que so o servico sabe — a hora ja interpretada e formatada, o
 * texto exato do lembrete, e a lista numerada quando o pedido ficou ambiguo.
 * Reconstruir isso no despacho seria manter duas versoes da mesma frase.
 *
 * Nenhum deles aceita "de quem": o dono entra por closure, do telefone ja
 * reconhecido. Nao ha campo para o modelo preencher errado.
 * ==========================================================================
 */
export type GuardarLembreteHandler = (input: {
  texto: string;
  quandoIso: string;
}) => Promise<{ mensagem: string }>;

/**
 * ATRIBUIR UM CLIENTE SEM DONA A UMA VENDEDORA — 09/10/2026.
 *
 * A PRIMEIRA ESCRITA DA AGENTE SOBRE CADASTRO DE CLIENTE, e ela e estreita
 * de proposito: SO PREENCHE O QUE ESTA EM BRANCO. Transferir carteira de uma
 * vendedora para outra nao passa por aqui — carteira decide o que cada
 * vendedora ve e recebe, e trocar isso por uma frase ambigua e caro demais.
 *
 * A frase de volta e montada no SERVIDOR, como nas outras escritas: ela
 * carrega nome de cliente e de vendedora, que e exatamente o que o modelo
 * inventaria.
 */
export type GestaoAtribuirVendedoraHandler = (input: {
  cliente: string;
  vendedora: string;
}) => Promise<{ mensagem: string }>;

export type MeusLembretesHandler = () => Promise<{
  /** Uma linha por lembrete, ja numerada — o numero serve ao remarcar e ao cancelar. */
  linhas: string[];
}>;

export type RemarcarLembreteHandler = (input: {
  /** O lembrete, por texto ("o da Faby") ou pela posicao na lista ("2"). */
  qual: string;
  quandoIso: string;
}) => Promise<{ mensagem: string }>;

export type CancelarLembreteHandler = (input: {
  qual: string;
}) => Promise<{ mensagem: string }>;

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
  /**
   * Quantos PULAR — a continuacao da lista, desde 05/10/2026.
   *
   * Nao e "numero da pagina": e quantos ja foram mostrados. O modelo le
   * "estes sao o 1o ao 20o de 97" e pede os proximos com 20, sem precisar
   * saber o tamanho da pagina, que e detalhe nosso.
   */
  aPartirDe?: number;
}) => Promise<
  GestaoLeituraResultado & { total?: number; aPartirDe?: number }
>;

/**
 * QUEM COMPRA NAQUELA EPOCA, pela gestao — 01/10/2026.
 *
 * COM `vendedora`, a carteira dela; SEM, a loja inteira — e e por isso que
 * carrega `EXIGE_VENDEDORA`: quem nao ve a loja (GERENTE_VENDAS, sem
 * `analytics:read`) e nao disse de quem quer nao recebeu "nenhum resultado",
 * recebeu uma pergunta incompleta. Dizer "nao encontrei" faria soar como dado
 * ausente.
 *
 * A UNIAO E DECLARADA AQUI, e nao no `GestaoLeituraResultado`: aquele tipo e
 * compartilhado por uma duzia de handlers e quatro formatadores, e alargar o
 * compartilhado para um caso e superficie que nao precisa ser tocada. Mesmo
 * desenho do `GestaoItensHandler`.
 */
export type GestaoEpocaHandler = (input: {
  /** Omitido = a loja inteira, quando quem pergunta pode ve-la. */
  vendedora?: string;
  mes?: number;
  dataComemorativa?: string;
}) => Promise<{
  status: 'OK' | 'AMBIGUA' | 'NAO_ENCONTRADA' | 'EXIGE_VENDEDORA';
  vendedora?: string;
  linhas: string[];
  nomes?: string[];
  total?: number;
}>;

export type GestaoMelhoresHandler = (input: {
  vendedora: string;
  categoria?: string;
  ultimosMeses?: number;
}) => Promise<GestaoLeituraResultado & { total?: number }>;

/**
 * AS VENDAS UMA A UMA — 02/10/2026.
 *
 * Pedido do Lucas depois de ver a Anastasia dizer "em setembro o Marco Abreu
 * fez 2 vendas, R$ 217.520" e, perguntada quem comprou, responder que nao
 * conseguia puxar. Todas as consultas de venda eram agregadas.
 *
 * TRES PERGUNTAS, UM FILTRO CADA: as compras de um cliente, as vendas de uma
 * vendedora num periodo, as pecas de um documento.
 *
 * `EXIGE_RECORTE` nao fala de dado: e a pergunta sem cliente, sem vendedora e
 * sem documento, que devolveria a loja inteira. Nao e "nao encontrei" — e uma
 * pergunta incompleta, e dizer o contrario faria soar como dado ausente.
 *
 * `sobre` diz de QUEM e a duvida quando o nome nao resolve: ha 17 clientes
 * chamadas Mariana e o modelo precisa saber se pergunta de qual CLIENTE ou de
 * qual VENDEDORA.
 */
export type GestaoVendasDetalhadasHandler = (input: {
  cliente?: string;
  vendedora?: string;
  documento?: string;
  periodo?: 'HOJE' | 'ONTEM' | 'SEMANA' | 'MES' | 'ANO';
  de?: string;
  ate?: string;
}) => Promise<{
  status: 'OK' | 'AMBIGUA' | 'NAO_ENCONTRADA' | 'EXIGE_RECORTE';
  /** De quem e a ambiguidade. */
  sobre?: 'cliente' | 'vendedora';
  /** Um bloco por venda, com as pecas ja embaixo. */
  linhas: string[];
  /** Nomes para desambiguar. */
  nomes?: string[];
  /** Quantas vendas existem no recorte — o teto so e honesto com o total. */
  total?: number;
}>;

/**
 * O FATURAMENTO DE CADA EMPRESA DO GRUPO — 02/10/2026.
 *
 * A A.T tem oito CNPJs e a venda sai por um deles. Perguntada pela receita da
 * MP Comercio, a agente procurou "MP" na lista de CLIENTES — empresa nao
 * existia para ferramenta nenhuma, e todo numero que ela dava era a soma de
 * todas.
 *
 * SEM NOME DE EMPRESA NO PARAMETRO, de proposito: sao oito, e duas com
 * movimento. Devolver a quebra inteira evita resolver nome — "MP", "a de
 * metais" e "MP Comercio" chegariam de tres jeitos — e ja responde a
 * pergunta seguinte, que e sempre "e as outras?".
 *
 * INDISPONIVEL e para quem nao enxerga a loja: o faturamento do grupo nao
 * tem versao estreita.
 */
export type GestaoPorEmpresaHandler = (input: {
  periodo?: 'HOJE' | 'ONTEM' | 'SEMANA' | 'MES' | 'ANO';
  de?: string;
  ate?: string;
}) => Promise<{
  status: 'OK' | 'INDISPONIVEL';
  linhas: string[];
}>;

export type GestaoPanoramaHandler = (
  input: RecorteDeTempo,
) => Promise<{ linhas: string[] }>;

/**
 * As pecas que mais faturaram. `vendedora` recorta so as dela.
 *
 * O `status` existe pelo mesmo motivo das outras ferramentas que resolvem
 * nome: pedir "as pecas da Marina" com duas Marinas na equipe nao pode virar
 * um chute.
 */
/**
 * A peca no catalogo, COM A QUANTIDADE — so para a gestao.
 *
 * O espelho da `consultarProdutos` da vendedora, que desde 25/09/2026 ve
 * apenas disponivel/indisponivel. A gestao pode ver o numero: decisao do
 * Lucas no mesmo dia, respondendo a pergunta de quem podia ver o que.
 */
export type GestaoProdutosHandler = (input: {
  busca: string;
  /** Ver `ConsultarProdutosLlmInput.incluirSemEstoque` — mesma regra. */
  incluirSemEstoque?: boolean;
  /** Ver `ConsultarProdutosLlmInput.categoria` — mesma regra. */
  categoria?: string;
  /** Ver `ConsultarProdutosLlmInput` — a faixa e a pagina, mesmas regras. */
  precoDe?: unknown;
  precoAte?: unknown;
  aPartirDe?: number;
  comFoto?: boolean;
  soComFoto?: boolean;
}) => Promise<{
  produtos: { linha: string }[];
  /** Ver `ConsultarProdutosLlmResultado` — amostra e total andam juntos. */
  total: number;
  semEstoque: number;
  incluiuSemEstoque: boolean;
  categoria?: string;
  foraDaCategoria: number;
  faixa?: { de?: number; ate?: number };
  pulados?: number;
  fotos?: FotoDeProdutoLlm[];
  tinhamFoto?: number;
  soComFoto?: boolean;
  naoConferidas?: number;
}>;

/**
 * O que mais saiu, por valor.
 *
 * `EXIGE_VENDEDORA` e o unico status que nao fala de dado: quem pergunta nao
 * pode ver a loja inteira (falta `analytics:read`) e nao disse de qual
 * vendedora quer. Nao e erro nem vazio — e um pedido de complemento, e a
 * resposta ao modelo tem que dizer isso, senao ele anuncia "nao encontrei" para
 * uma pergunta que so faltou um nome.
 */
export type GestaoItensHandler = (
  input: {
    periodo?: 'HOJE' | 'ONTEM' | 'SEMANA' | 'MES' | 'ANO';
    limite?: number;
    vendedora?: string;
  } & Pick<RecorteDeTempo, 'de' | 'ate'>,
) => Promise<{
  status: 'OK' | 'AMBIGUA' | 'NAO_ENCONTRADA' | 'EXIGE_VENDEDORA';
  linhas: string[];
}>;

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
 * QUEM ESTA CONVERSANDO AGORA — 29/09/2026, pedido do Lucas.
 *
 * ==========================================================================
 * A UNICA FERRAMENTA DA GESTAO QUE NAO ESPERA O LEITOR.
 *
 * Todas as outras leem a linha do tempo, que nasce do leitor, que roda uma
 * hora depois de a conversa PARAR. Esta le o ponteiro, que o webhook atualiza
 * a cada mensagem — e por isso responde "esta conversando?" enquanto a
 * conversa acontece, que e quando a pergunta e feita.
 *
 * O PRECO E O QUE ELA NAO SABE, e esta na forma da resposta: sem o leitor nao
 * ha assunto, nao ha resumo, e o numero desconhecido e so um numero
 * desconhecido. Ela conta conversas; nao diz do que tratam nem afirma que sao
 * clientes.
 * ==========================================================================
 *
 * Com `vendedora`, so o celular daquela pessoa. SEM ela, a loja inteira.
 */
export type GestaoConversasAgoraHandler = (input: {
  vendedora?: string;
  /** Quanto tempo atras ainda conta como "agora". Sem ele, 30 minutos. */
  minutos?: number;
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
  /**
   * O status DA VENDEDORA: `NOVO`, `EM_CONTATO`, `VIROU_CLIENTE`,
   * `NAO_VINGOU` — 08/10/2026.
   *
   * So vale com `vendedora`: a fila geral nao e por pessoa, e o status e o
   * que ELA fez com o lead.
   */
  status?: string;
  /** Um dia so, `AAAA-MM-DD`, por QUANDO O LEAD ENTROU. So com `vendedora`. */
  dia?: string;
}) => Promise<GestaoLeituraResultado & { total?: number }>;

/**
 * AS METRICAS DE ATENDIMENTO — ANA-08 a ANA-12, 29/09/2026.
 *
 * As cinco numa ferramenta so, porque sao sempre perguntadas juntas ("como foi
 * o mes?") e saem das mesmas duas tabelas. Separadas, o modelo encadearia
 * cinco chamadas — cinco idas ao banco e cinco turnos pagos — para montar
 * cinco linhas.
 *
 * Aceita as DUAS formas de recorte, como o resto das consultas de numero: o
 * atalho em palavra (`periodo`) ou as datas soltas, que ganham quando vem.
 */
export type GestaoMetricasHandler = (input: {
  /** Data inicial `AAAA-MM-DD`. Com `ate`, manda no `periodo`. */
  de?: string;
  /** Data final `AAAA-MM-DD`. */
  ate?: string;
  /** O atalho. Default MES — em HOJE a media quase sempre sai de zero casos. */
  periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
}) => Promise<GestaoLeituraResultado>;

/**
 * OS CINCO RANKINGS — ANA-14, 29/09/2026.
 *
 * O `eixo` existe para a resposta nao virar um relatorio: quem pergunta
 * "quem responde mais rapido" quer UMA linha, e nao os cinco rankings da
 * equipe. Sem eixo, vem um resumo dos cinco.
 */
export type GestaoRankingsHandler = (input: {
  eixo?:
    | 'RESPOSTA'
    | 'FECHAMENTO'
    | 'INTERACOES'
    | 'CONVERSAO'
    | 'LEADS';
  de?: string;
  ate?: string;
  periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
}) => Promise<GestaoLeituraResultado>;

/**
 * A ANALISE DE TOM — ANA-15, 29/09/2026.
 *
 * As DUAS entradas sao obrigatorias, e isso e desenho: "como a Cida tem
 * tratado os clientes" nao e respondivel sem arbitrar de quais conversas, e
 * arbitrar aqui produziria um veredito sobre a pessoa a partir de uma amostra
 * que ninguem escolheu.
 */
export type GestaoTomHandler = (input: {
  vendedora: string;
  cliente: string;
}) => Promise<GestaoLeituraResultado>;

/**
 * A COMPARACAO ANO A ANO — 29/09/2026.
 *
 * Nasceu de uma pergunta que a Anastasia nao sabia responder: "como esta o
 * nosso mes comparado aos outros anos?". O dado estava na base desde 2023; o
 * que faltava era a pergunta.
 */
export type GestaoCompararAnosHandler = (input: {
  /** 1 a 12. O mes inteiro, em cada ano que tiver dado. */
  mes?: number;
  /** Com `ate`: o mesmo intervalo de dias em cada ano. */
  de?: string;
  ate?: string;
  /** Nome da vendedora. Ausente = a loja. */
  vendedora?: string;
}) => Promise<GestaoLeituraResultado>;

/**
 * ESTE PERIODO CONTRA O ANTERIOR — 29/09/2026.
 *
 * NAO CONFUNDIR com `GestaoCompararAnosHandler`, que compara o MESMO recorte
 * em anos diferentes. Aqui e "esta semana contra a semana passada". As duas
 * perguntas se parecem e sao diferentes; a descricao de cada ferramenta e o
 * que impede o modelo de trocar uma pela outra.
 */
export type GestaoCompararAnteriorHandler = (input: {
  periodo?: 'SEMANA' | 'MES' | 'ANO';
  de?: string;
  ate?: string;
  vendedora?: string;
}) => Promise<GestaoLeituraResultado>;

export type GestaoFunilHandler = (input: {
  /** Nome (ou parte). Ausente = a equipe inteira de quem pergunta. */
  vendedora?: string;
  /**
   * So os atendimentos nesta etapa — 08/10/2026.
   *
   * Responde "quem esta SO em negociacao", que era a pergunta da gestao que
   * o agregado nao alcancava.
   */
  etapa?: string;
  /** Um dia so, `AAAA-MM-DD`, pela data de ABERTURA do atendimento. */
  dia?: string;
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

/**
 * UM ARQUIVO QUE A USUARIA MANDOU, PARA O MODELO LER — 08/10/2026. RF9.
 *
 * ==========================================================================
 * A PRIMEIRA COISA QUE NAO E TEXTO A CHEGAR AO MODELO NESTE PROJETO.
 *
 * Ate aqui nenhuma chamada era multimodal — nem a foto do catalogo, que pede
 * o CODIGO da peca a vendedora e trabalha so em texto. Entao isto nao e
 * "mais um campo": e a porta aceitando conteudo de outra natureza.
 *
 * MORA EM `ChatParams`, E NAO EM `MensagemAgente`, DE PROPOSITO. A mensagem e
 * PERSISTIDA na tabela `conversas` e e o que a memoria da conversa relembra;
 * alargar o `content` para bloco arrastaria persistencia e memoria junto, e
 * guardaria base64 de planilha no banco. O anexo vale para ESTA chamada:
 * viaja ao lado, cola no ultimo turno da usuaria e nao fica.
 *
 * O XLSX NAO VEM POR AQUI. O modelo le PDF e imagem nativamente, mas `.xlsx`
 * e um zip de XML — ele e convertido em TABELA antes, e entra como texto.
 * ==========================================================================
 */
export interface AnexoDaConversa {
  /** O que o modelo recebe: bloco de imagem ou bloco de documento. */
  tipo: 'imagem' | 'pdf';
  /** O arquivo em base64 — a API nao aceita URL para isto. */
  base64: string;
  /** `image/jpeg`, `image/png`, `application/pdf`. */
  mime: string;
  /**
   * O nome do arquivo, quando o WhatsApp manda. Entra como texto ao lado do
   * bloco: "Posicao de estoque.pdf" diz ao modelo o que ele esta lendo, e um
   * PDF sem nome fica indistinguivel de outro na mesma conversa.
   */
  nome?: string;
}

export interface ChatParams {
  model: string;
  system: string;
  maxTokens: number;
  mensagens: MensagemAgente[];
  /**
   * Arquivos desta chamada, colados no ULTIMO turno da usuaria — RF9.
   *
   * Nao sao persistidos e nao entram na memoria da conversa: quem manda
   * planilha pergunta sobre ela agora. Ver `AnexoDaConversa`.
   */
  anexos?: AnexoDaConversa[];
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
  clientesPorEpoca?: ClientesPorEpocaHandler;
  gestaoEpoca?: GestaoEpocaHandler;
  gestaoVendasDetalhadas?: GestaoVendasDetalhadasHandler;
  gestaoPorEmpresa?: GestaoPorEmpresaHandler;
  /** So quem ve a loja recebe a ferramenta — o grupo nao tem versao estreita. */
  gestaoPorEmpresaDisponivel?: boolean;
  /** Espelha o `gestaoItensExigeVendedora`: sem `verLoja`, o schema obriga. */
  gestaoEpocaExigeVendedora?: boolean;
  melhoresClientes?: MelhoresClientesHandler;
  // Idem para `clientes_por_fidelidade` — os Ouro, Prata e Bronze da carteira.
  clientesPorFidelidade?: ClientesPorFidelidadeHandler;
  // Idem para `agendar_contato` — a unica que escreve.
  agendarContato?: AgendarContatoHandler;
  // Canal da GESTAO. Nunca convivem com os de cima: quem monta os handlers e o
  // use case, e cada canal monta so o seu conjunto.
  gestaoAgenda?: GestaoAgendaHandler;
  gestaoVendas?: GestaoVendasHandler;
  gestaoMetas?: GestaoMetasHandler;
  gestaoPorFamilia?: GestaoPorFamiliaHandler;
  guardarCombinado?: GuardarCombinadoHandler;
  listarCombinados?: ListarCombinadosHandler;
  esquecerCombinado?: EsquecerCombinadoHandler;
  // Os lembretes pessoais — do SOLICITANTE, e de mais ninguem.
  guardarLembrete?: GuardarLembreteHandler;
  meusLembretes?: MeusLembretesHandler;
  remarcarLembrete?: RemarcarLembreteHandler;
  cancelarLembrete?: CancelarLembreteHandler;
  gestaoPanorama?: GestaoPanoramaHandler;
  gestaoItens?: GestaoItensHandler;
  /**
   * Declara a versao ESTREITA do `itens_mais_vendidos`, em que `vendedora` e
   * obrigatoria — para quem gerencia as vendedoras e nao ve o faturamento da
   * loja (sem `analytics:read`).
   *
   * Vem junto com os handlers, do `FerramentasGestaoService.montar`, e nao de
   * um parametro proprio de quem chama: assim nenhuma porta pode montar as
   * ferramentas e esquecer de dizer qual escopo e.
   */
  gestaoItensExigeVendedora?: boolean;
  gestaoProdutos?: GestaoProdutosHandler;
  gestaoCarteiraDoCliente?: GestaoCarteiraDoClienteHandler;
  gestaoEncaminharLead?: GestaoEncaminharLeadHandler;
  gestaoVendedoras?: GestaoVendedorasHandler;
  gestaoLeads?: GestaoLeadsHandler;
  gestaoCarteira?: GestaoCarteiraHandler;
  gestaoMelhores?: GestaoMelhoresHandler;
  // Idem para `clientes_por_fidelidade` da gestao: a loja, ou uma vendedora.
  gestaoFidelidade?: GestaoFidelidadeHandler;
  // Idem para `atribuir_vendedora_ao_cliente` — a escrita de carteira.
  gestaoAtribuirVendedora?: GestaoAtribuirVendedoraHandler;
  gestaoAgendar?: GestaoAgendarHandler;
  gestaoFeedbacks?: GestaoFeedbacksHandler;
  gestaoDiaDaVendedora?: GestaoDiaDaVendedoraHandler;
  gestaoConversasAgora?: GestaoConversasAgoraHandler;
  gestaoFunil?: GestaoFunilHandler;
  gestaoPanoramaLeads?: GestaoPanoramaLeadsHandler;
  gestaoMetricas?: GestaoMetricasHandler;
  gestaoRankings?: GestaoRankingsHandler;
  gestaoTom?: GestaoTomHandler;
  gestaoCompararAnos?: GestaoCompararAnosHandler;
  gestaoCompararAnterior?: GestaoCompararAnteriorHandler;
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
  /**
   * As fotos das pecas que a busca encontrou, JA BAIXADAS — 07/10/2026.
   *
   * Mesmo desenho do `grafico`: a ferramenta produz um artefato que nao cabe
   * no texto, e ele viaja por fora do dialogo ate quem sabe envia-lo.
   *
   * Vem com bytes, e nao com URL: a origem e HTTP e o envio exige base64 —
   * e, mais importante, metade das URLs responde 404. Quem baixou ja sabe
   * quais existem; mandar a URL adiante empurraria essa descoberta para
   * depois da resposta.
   */
  fotos?: FotoDeProdutoLlm[];
  /**
   * POR QUE A RESPOSTA VEIO SEM TEXTO — 09/10/2026.
   *
   * ==========================================================================
   * TEXTO VAZIO VIRAVA SILENCIO, E SILENCIO NAO E RESPOSTA.
   *
   * O webhook trata `!resposta` como "nao ha o que responder" — regra certa
   * para audio vazio no canal do cliente. No canal interno ela e outra coisa:
   * a pessoa perguntou, a agente mostrou "digitando...", e nao chegou nada.
   *
   * Aconteceu em producao em 09/10. A gestora perguntou "quem tem leads
   * hoje", a agente explicou o recorte e perguntou "geral, ou de uma
   * vendedora?", ela respondeu "geral" — e entao o silencio.
   *
   * O cliente JA LOGAVA o motivo desde 29/09 ("resposta sem texto:
   * stop_reason=..."), mas o log fica no servidor e quem perguntou fica sem
   * nada. Agora o motivo sobe junto, e o canal decide o que dizer.
   * ==========================================================================
   *
   * Ausente quando ha texto. `max_tokens` e o caso esperado: o teto cortou a
   * resposta antes de o modelo escrever a primeira palavra.
   */
  semTexto?: 'max_tokens' | 'refusal' | 'outro';
}

/** Uma foto pronta para enviar, com a legenda que acompanha a peca. */
export interface FotoDeProdutoLlm {
  codigo: string;
  legenda: string;
  conteudo: Buffer;
  mime: string;
}

// Porta que abstrai o provedor de LLM (implementada via @anthropic-ai/sdk na
// infraestrutura). Mantem o dominio/aplicacao livre de tipos do SDK.
export interface ILlmClient {
  chat(params: ChatParams): Promise<ChatResultado>;
  // Variante que habilita a ferramenta gerar_grafico e resolve o ciclo
  // tool_use -> tool_result -> continuacao internamente.
  chatComFerramentas(params: ChatParams): Promise<ChatComFerramentasResultado>;
}
