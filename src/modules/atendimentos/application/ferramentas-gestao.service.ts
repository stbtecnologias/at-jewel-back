import { Inject, Injectable } from '@nestjs/common';
import { diasDeCalendario } from '../../../shared/tempo/dias-de-calendario';
import { datasDeRecorte } from '../../../shared/tempo/recorte-de-datas';
import type {
  GestaoCarteiraHandler,
  GestaoMelhoresHandler,
  GestaoAgendarHandler,
  GestaoCarteiraDoClienteHandler,
  GestaoEncaminharLeadHandler,
  GestaoLeadsHandler,
  GestaoVendedorasHandler,
  GestaoDiaDaVendedoraHandler,
  GestaoFeedbacksHandler,
  GestaoFunilHandler,
  GestaoMetricasHandler,
  GestaoRankingsHandler,
  GestaoTomHandler,
  GestaoPanoramaLeadsHandler,
  GestaoPorFamiliaHandler,
  GestaoLeituraResultado,
  GestaoMetasHandler,
  GestaoItensHandler,
  GestaoProdutosHandler,
  GestaoPanoramaHandler,
  GestaoVendasHandler,
  GestaoAgendaHandler,
} from '../../agentes/domain/ports/llm-client.port';
import { CLIENTE_REPOSITORY } from '../../clientes/domain/ports/injection-tokens';
import { LEAD_REPOSITORY } from '../../leads/domain/ports/injection-tokens';
import type { ILeadRepository } from '../../leads/domain/ports/repositories/lead-repository.port';
import type { IClienteRepository } from '../../clientes/domain/ports/repositories/cliente-repository.port';
import { VENDEDORA_REPOSITORY } from '../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import {
  AgendarContatoGestaoUseCase,
  MINUTOS_LEMBRETE,
  type ResultadoAgendamentoGestao,
} from './use-cases/agendar-contato-gestao.use-case';
import {
  ConsultarVendasUseCase,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
} from '../../movimentacoes/application/use-cases/consultar-vendas.use-case';
import { ListarProdutosUseCase } from '../../produtos/application/use-cases/listar-produtos.use-case';
import { ConsultarAgendaVendedoraUseCase } from './use-cases/consultar-agenda-vendedora.use-case';
import { ConsultarCarteiraVendedoraUseCase } from './use-cases/consultar-carteira-vendedora.use-case';
import { ConsultarDesempenhoVendedoraUseCase } from './use-cases/consultar-desempenho-vendedora.use-case';
import { ResolverVendedoraPorNomeUseCase } from './use-cases/resolver-vendedora-por-nome.use-case';
import { ConsultarAuditoriaUseCase } from './use-cases/consultar-auditoria.use-case';
import { ConsultarLinhaDoTempoUseCase } from './use-cases/consultar-linha-do-tempo.use-case';
import type {
  ContagemPorEtapa,
  PontoDaLinha,
} from '../domain/ports/repositories/atendimento-repository.port';
import { EncaminharLeadUseCase } from './use-cases/encaminhar-lead.use-case';
import { fraseDoFunil, rotuloEtapa } from './etapas-em-palavras';
import {
  estadoLegivel,
  linhaDoLead,
} from '../../leads/application/leads-em-lista';
import {
  MetricasDeAtendimentoUseCase,
  comAmostra,
  emPortugues,
  fraseDaConversao,
} from './use-cases/metricas-de-atendimento.use-case';
import {
  MINIMO_PARA_RANQUEAR,
  RankingsDeAtendimentoUseCase,
  type PostoDeRanking,
} from './use-cases/rankings-de-atendimento.use-case';
import { AnalisarTomUseCase } from '../../atendimento/application/analisar-tom.use-case';

const MAXIMO_CLIENTES_HOMONIMOS = 5;
/** Feedbacks por resposta. Acima disso a mensagem deixa de ser lida. */
const MAXIMO_FEEDBACKS = 10;
/** Leads por resposta. Acima disso a mensagem deixa de ser lida. */
const MAXIMO_LEADS = 15;

/**
 * O status como uma pessoa fala. DISPONIVEL nao entra: ela e o normal, e
 * escrever "disponivel" em toda linha da lista so gasta o olho de quem le.
 */
const DISPONIBILIDADE_LEGIVEL: Record<string, string> = {
  DISPONIVEL: 'disponível',
  OCUPADA: 'ocupada',
  AUSENTE: 'ausente',
  FERIAS: 'de férias',
};

/**
 * "anel" -> "anéis", e nao "anels".
 *
 * ==========================================================================
 * PARECE FRESCURA E NAO E. O primeiro teste contra o banco devolveu
 * "CAMILA BRITO: 7 anels", e essa frase sai no WhatsApp da dona da loja.
 *
 * A LISTA DE FAMILIAS E FECHADA E PEQUENA — o catalogo tem umas vinte —, o
 * que torna isto conferivel: BRINCO, ANEL, COLAR, PULSEIRA, PINGENTE,
 * PIERCING, VASO, BOWL, LIVRO, ABAJUR, BANDEJA. Nao e um pluralizador de
 * portugues, e o suficiente para esses.
 *
 * As terminacoes em ordem importam: `-el` casa antes de `-l`, senao "anel"
 * cairia na regra geral de `-l` e viraria "anelis".
 *
 * O QUE ELE NAO RESOLVE, e fica dito: familia que ja chega no plural
 * ("ARGOLAS") ou invariavel ("OCULOS") ganha um "es" indevido. Sao duas na
 * base inteira, e a linha continua legivel — trocar isso por uma tabela de
 * excecoes seria mais codigo do que o problema merece.
 * ==========================================================================
 */
function noPlural(palavra: string): string {
  const p = palavra.toLowerCase();

  if (p.endsWith('ão')) return `${p.slice(0, -2)}ões`;
  if (p.endsWith('el')) return `${p.slice(0, -2)}éis`;
  if (p.endsWith('al')) return `${p.slice(0, -2)}ais`;
  if (p.endsWith('ol')) return `${p.slice(0, -2)}óis`;
  if (p.endsWith('il')) return `${p.slice(0, -2)}is`;
  if (p.endsWith('m')) return `${p.slice(0, -1)}ns`;
  // Terminadas em `s` ja servem de plural ("oculos"): mexer piora.
  if (p.endsWith('s')) return p;
  if (/[rz]$/.test(p)) return `${p}es`;
  return `${p}s`;
}

/** "4 brincos", "1 anel" — a unidade concorda com o numero. */
function pecas(quantidade: number, familia: string): string {
  const nome = familia.toLowerCase();
  return `${quantidade} ${quantidade === 1 ? nome : noPlural(nome)}`;
}

/**
 * Os meses por extenso, para a linha do mes recorrente.
 *
 * Escrito aqui e nao com `toLocaleDateString`: o container e Alpine e o ICU do
 * Node ja mordeu este projeto antes (ver a memoria do fuso). Doze palavras
 * fixas nao dependem de locale instalado.
 */
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Janela padrao quando nao dizem "hoje" nem "esta semana". */
const DIAS_PADRAO_FEEDBACK = 7;

/** O conjunto de handlers da gestao, pronto para entrar no `chatComFerramentas`. */
export interface FerramentasGestao {
  gestaoAgenda: GestaoAgendaHandler;
  gestaoVendas: GestaoVendasHandler;
  gestaoMetas: GestaoMetasHandler;
  gestaoPanorama: GestaoPanoramaHandler;
  gestaoItens: GestaoItensHandler;
  gestaoProdutos: GestaoProdutosHandler;
  gestaoAgendar: GestaoAgendarHandler;
  gestaoCarteiraDoCliente: GestaoCarteiraDoClienteHandler;
  gestaoEncaminharLead: GestaoEncaminharLeadHandler;
  gestaoLeads: GestaoLeadsHandler;
  gestaoVendedoras: GestaoVendedorasHandler;
  gestaoCarteira: GestaoCarteiraHandler;
  gestaoMelhores: GestaoMelhoresHandler;
  gestaoFeedbacks: GestaoFeedbacksHandler;
  gestaoDiaDaVendedora: GestaoDiaDaVendedoraHandler;
  gestaoFunil: GestaoFunilHandler;
  gestaoPanoramaLeads: GestaoPanoramaLeadsHandler;
  gestaoMetricas: GestaoMetricasHandler;
  gestaoRankings: GestaoRankingsHandler;
  gestaoTom: GestaoTomHandler;
  gestaoPorFamilia: GestaoPorFamiliaHandler;
  /**
   * NAO E UM HANDLER — e um aviso que viaja junto para o cliente do LLM.
   *
   * Ele entra no `ChatParams` pelo mesmo espalhamento dos handlers, e la decide
   * QUAL versao do `itens_mais_vendidos` e declarada ao modelo: a que aceita a
   * loja inteira, ou a que exige uma vendedora.
   *
   * Vive aqui, e nao num parametro a parte de quem chama, para que as tres
   * portas (WhatsApp, painel e o que vier) nao possam esquecer de passa-lo — o
   * `montar` e o unico lugar que decide, e o resultado carrega a decisao.
   */
  gestaoItensExigeVendedora?: boolean;
}

/** O que o `montar` precisa saber sobre quem esta do outro lado. */
export interface ContextoGestao {
  /**
   * Nome de quem esta falando. Entra apenas no AVISO que a vendedora recebe —
   * "A Fernanda agendou o cliente..." —, para ela saber de quem veio o
   * compromisso. Nao muda o que ferramenta nenhuma enxerga.
   */
  solicitante?: string | null;
  /**
   * Pode ver a LOJA, e nao so cada vendedora? — 28/09/2026.
   *
   * `false` estreita o `itens_mais_vendidos`: ele passa a exigir uma vendedora,
   * entao "o que a Camila mais vendeu" continua de pe e "o que a loja mais
   * vendeu" deixa de existir. Nenhuma outra ferramenta muda, porque nenhuma
   * outra fala da loja em dinheiro.
   *
   * O PADRAO E `false` DE PROPOSITO. Quem esquecer de informar recebe o escopo
   * ESTREITO — um esquecimento tira uma resposta, e nao abre o faturamento.
   */
  verLoja?: boolean;
  /**
   * Pode ver a QUANTIDADE por peca? — 28/09/2026, requisito P-04.
   *
   * `false` faz o `consultar_produtos` responder "disponivel" / "sem estoque"
   * em vez do numero, que e o que a gerente precisa: saber se a peca atende e
   * quanto custa para o cliente.
   *
   * SEPARADO DO `verLoja` porque sao perguntas diferentes: uma e sobre o
   * faturamento da loja, a outra sobre o saldo da peca, e a matriz do
   * documento de requisitos responde `SIM` e `NAO` para a mesma pessoa.
   *
   * Padrao `false` pelo mesmo motivo do `verLoja`.
   */
  verQuantidade?: boolean;
  /**
   * AS VENDEDORAS QUE ESTA PESSOA ALCANCA — 28/09/2026, requisitos RF-06 e
   * RF-08.
   *
   * ==========================================================================
   * `null` E "SEM RECORTE", E NAO "NENHUMA". A distincao e a mesma do
   * `VendaRepository.vendedorasDaEquipeDoUsuario`, e pelo mesmo motivo:
   *
   *   null       -> sem equipe; alcanca todas (o comportamento historico)
   *   []         -> equipe cadastrada e vazia; nao alcanca ninguem
   *   [a, b, c]  -> so essas
   *
   * VEM DO MESMO `EscopoVendasService` QUE O PAINEL USA. Duas implementacoes
   * da mesma regra responderiam igual hoje e divergiriam na primeira correcao
   * feita de um lado so — e o sintoma seria o pior possivel: a MESMA pergunta
   * com resposta diferente conforme a porta, sem nada indicando que sao
   * caminhos distintos.
   *
   * O PADRAO E `null` — sem recorte —, e aqui o padrao permissivo e o certo,
   * ao contrario do `verLoja`. Equipe e cadastro, nao permissao: enquanto
   * ninguem estiver vinculado, recortar por engano deixaria TODA a gestao sem
   * resposta nenhuma, que e uma falha muito mais visivel e muito mais cara do
   * que a que se tentava evitar.
   * ==========================================================================
   */
  equipe?: string[] | null;
}

/**
 * As ferramentas da GESTAO, num lugar so.
 *
 * ==========================================================================
 * POR QUE ISTO E UM SERVICO, E NAO CODIGO DENTRO DO USE CASE DO WHATSAPP.
 *
 * Elas nasceram dentro do canal de WhatsApp. Quando o painel passou a precisar
 * das mesmas ferramentas, copiar seria a saida rapida — e as duas copias
 * divergiriam na primeira correcao feita so de um lado. O sintoma seria o pior
 * possivel: a MESMA pergunta com resposta diferente conforme a porta, sem nada
 * indicando que sao caminhos distintos.
 *
 * Com um lugar so, corrigir a ambiguidade de homonimo — ou a ordem entre
 * transferir e agendar — vale nos dois canais de uma vez.
 * ==========================================================================
 *
 * O QUE MUDA ENTRE AS PORTAS nao esta aqui: e o `graficos` (o WhatsApp nao
 * renderiza) e a memoria de conversa. Isso fica em quem chama.
 */
@Injectable()
export class FerramentasGestaoService {
  constructor(
    private readonly resolverVendedora: ResolverVendedoraPorNomeUseCase,
    private readonly consultarVendas: ConsultarVendasUseCase,
    private readonly metricas: MetricasDeAtendimentoUseCase,
    private readonly rankings: RankingsDeAtendimentoUseCase,
    private readonly tom: AnalisarTomUseCase,
    private readonly listarProdutos: ListarProdutosUseCase,
    private readonly agenda: ConsultarAgendaVendedoraUseCase,
    private readonly desempenho: ConsultarDesempenhoVendedoraUseCase,
    private readonly carteira: ConsultarCarteiraVendedoraUseCase,
    private readonly agendarGestao: AgendarContatoGestaoUseCase,
    private readonly auditoria: ConsultarAuditoriaUseCase,
    private readonly linha: ConsultarLinhaDoTempoUseCase,
    private readonly encaminharLead: EncaminharLeadUseCase,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(LEAD_REPOSITORY)
    private readonly leads: ILeadRepository,
  ) {}

  /**
   * @param ctx quem esta do outro lado — ver `ContextoGestao`.
   *
   *   Era `montar(solicitante?: string)` ate 28/09/2026. Virou objeto quando o
   *   escopo deixou de ser o mesmo para toda a administracao: o papel
   *   GERENTE_VENDAS gerencia as vendedoras e nao ve o faturamento da loja.
   */
  montar(ctx: ContextoGestao = {}): FerramentasGestao {
    const {
      solicitante,
      verLoja = false,
      verQuantidade = false,
      equipe = null,
    } = ctx;

    /** Esta vendedora esta no alcance de quem pergunta? */
    const alcanca = (vendedoraId: string): boolean =>
      equipe === null || equipe.includes(vendedoraId);

    return {
      gestaoItensExigeVendedora: !verLoja,

      gestaoAgenda: async ({ vendedora, periodo }) =>
        this.comVendedora(equipe, vendedora, async (id) => {
          const compromissos = await this.agenda.execute(id, periodo);
          return compromissos.map(
            (c) =>
              `${c.cliente} — ${formatarQuando(c.quando)}` +
              `${c.ocasiao ? ` (${c.ocasiao})` : ''}`,
          );
        }),

      gestaoVendas: async ({ vendedora, periodo, de, ate }) =>
        this.comVendedora(equipe, vendedora, async (id) => {
          const datas = datasDeRecorte(de, ate);
          const v = datas
            ? await this.consultarVendas
                .resumoEntre(datas.de, datas.ate, id)
                .then((r) => ({
                  quantidade: r.quantidade,
                  receita: r.receita,
                  ticketMedio: r.ticketMedio,
                }))
            : await this.desempenho.vendas(id, periodo ?? 'SEMANA');
          if (v.quantidade === 0) return [];
          return [
            `${v.quantidade} ${v.quantidade === 1 ? 'venda' : 'vendas'}, ` +
              `${moeda(v.receita)} em receita, ticket médio ${moeda(v.ticketMedio)}`,
          ];
        }),

      gestaoMetas: async ({ vendedora }) =>
        this.comVendedora(equipe, vendedora, async (id) => {
          const metas = await this.desempenho.metas(id);
          return metas.map((m) =>
            m.batida
              ? `${m.descricao}: alvo ${moeda(m.alvo)}, já batida — realizado ${moeda(m.realizado)} (${m.percentual}%)`
              : `${m.descricao}: alvo ${moeda(m.alvo)}, realizado ${moeda(m.realizado)} (${m.percentual}%), faltam ${moeda(m.restante)} até ${m.prazo.toLocaleDateString('pt-BR')}`,
          );
        }),

      gestaoCarteira: async ({ vendedora, meses }) => {
        // A carteira e por CODIGO DO ERP, e nao por id. Vendedora sem codigo
        // simplesmente nao tem carteira — o use case devolve vazio.
        let total = 0;
        const r = await this.comVendedora(equipe, vendedora, async (_id, codigoErp) => {
          const pagina = await this.carteira.semComprar(codigoErp, meses ?? 6);
          total = pagina.total;
          return pagina.clientes.map((c) =>
            c.ultimaCompra
              ? `${c.nome} — última compra em ${c.ultimaCompra.toLocaleDateString('pt-BR')}, ${c.quantidade} ${c.quantidade === 1 ? 'compra' : 'compras'} no total`
              : `${c.nome} — nunca comprou`,
          );
        });
        return { ...r, total };
      },

      gestaoMelhores: async ({ vendedora, categoria, ultimosMeses }) => {
        let total = 0;
        const r = await this.comVendedora(equipe, vendedora, async (_id, codigoErp) => {
          const pagina = await this.carteira.maioresCompradores(codigoErp, {
            categoria,
            ultimosMeses,
          });
          total = pagina.total;
          const unidade = categoria ? 'peça' : 'compra';
          return pagina.clientes.map(
            (c) =>
              `${c.nome} — ${c.quantidade} ${c.quantidade === 1 ? unidade : unidade + 's'}, ${moeda(c.valorTotal)}`,
          );
        });
        return { ...r, total };
      },

      // A PECA NO CATALOGO, COM A QUANTIDADE — 25/09/2026.
      //
      // O espelho da `consultarProdutos` da vendedora.
      //
      // ==================================================================
      // A QUANTIDADE DEIXOU DE SER DA GESTAO INTEIRA — 28/09/2026.
      //
      // Em 25/09 a decisao foi "a gestao pode ver o numero", e valia para
      // todo mundo que entrasse no canal. O documento de requisitos de 28/09
      // desfez isso na pendencia P-04, e o Lucas confirmou: a gerente
      // "tem que entender se a peca que ela quer esta disponivel no estoque e
      // quanto e o preco de venda. Ela nao precisa saber de quantidade".
      //
      // Entao o numero passou a depender de `estoque:quantidade`, a MESMA
      // chave que a API de produtos usa. Uma chave, duas portas: mexer na
      // permissao de um papel muda o painel e o WhatsApp juntos.
      // ==================================================================
      //
      // O SALDO VEM DA TABELA `estoque` — o `estoqueAtual` do
      // `ListarProdutosUseCase` ja e o somatorio de la desde 17/09, e nao a
      // coluna `produtos.estoque_atual`, que esta zerada na base inteira.
      gestaoProdutos: async ({ busca }) => {
        const achados = await this.listarProdutos.execute({
          busca,
          ativo: true,
          limit: 6,
        });
        return {
          produtos: achados.map((p) => ({
            linha:
              `${p.descricaoEtiqueta ?? `${p.categoria} ${p.familia}`}` +
              `${p.codigoErp ? ` — código ${p.codigoErp}` : ''}: ` +
              `${moeda(p.valorVenda)}, ` +
              `${saldoEmPalavras(p.estoqueAtual, verQuantidade)}`,
          })),
        };
      },

      // O QUE MAIS SAIU — 25/09/2026. Le a MOVIMENTACAO, como todo o resto de
      // venda desde hoje; ver `ConsultarVendasUseCase`.
      gestaoItens: async ({ periodo, limite, vendedora, de, ate }) => {
        // ================================================================
        // A SEGUNDA BARREIRA DO ESCOPO ESTREITO, E ELA E DE PROPOSITO.
        //
        // A primeira e o `input_schema`: sem `verLoja` o modelo recebe a
        // versao da tool que declara `vendedora` como obrigatoria, e a API
        // recusa a chamada sem ela. Esta aqui existe porque schema e um
        // PEDIDO — vale enquanto ninguem mexer na lista de tools, e quem
        // mexer nao vai lembrar deste arquivo.
        //
        // Mesmo desenho do `BuscarAdminPorTelefoneUseCase`, que confere
        // telefone E permissao: duas barreiras independentes para o mesmo
        // erro, porque o erro aqui e silencioso — entregar o faturamento da
        // loja a quem nao pode ve-lo nao levanta excecao nenhuma.
        // ================================================================
        if (!verLoja && !vendedora?.trim()) {
          return { status: 'EXIGE_VENDEDORA', linhas: [] };
        }

        // O nome so e resolvido quando ela PEDE um recorte por vendedora — a
        // pergunta comum e sobre a loja inteira, e nao paga essa consulta.
        let vendedoraId: string | null = null;
        if (vendedora?.trim()) {
          const r = await this.resolverVendedora.execute(vendedora);
          if (r.status === 'AMBIGUA') {
            return { status: 'AMBIGUA', linhas: r.nomes };
          }
          if (r.status === 'NAO_ENCONTRADA') {
            return { status: 'NAO_ENCONTRADA', linhas: r.sugestoes };
          }
          // Fora da equipe responde como "nao achei" — igual ao
          // `comVendedora`, e pelo mesmo motivo: dizer "voce nao pode ver a
          // Fulana" confirmaria que a Fulana existe.
          if (!alcanca(r.id)) {
            return { status: 'NAO_ENCONTRADA', linhas: [] };
          }
          vendedoraId = r.id;
        }

        const datas = datasDeRecorte(de, ate);
        const linhas = datas
          ? await this.consultarVendas.itensEntre(
              datas.de,
              datas.ate,
              limite ?? LIMITE_PADRAO,
              vendedoraId,
            )
          : (
              await this.consultarVendas.itens(
                periodo ?? 'HOJE',
                limite ?? LIMITE_PADRAO,
                vendedoraId,
              )
            ).linhas;

        return {
          status: 'OK',
          linhas: linhas.map((i) => {
            const nome = i.descricao?.trim() || i.familia || 'Sem descrição';
            // A QUANTIDADE SO APARECE QUANDO E MAIS DE UMA. Numa joalheria a
            // peca e quase sempre unica, e "1 un" em toda linha e ruido.
            const qtd = i.quantidade > 1 ? ` · ${i.quantidade} un` : '';
            return `${i.codigoErp ?? '—'} ${nome} — ${moeda(i.valor)}${qtd}`;
          }),
        };
      },

      /**
       * "Quem vendeu mais esse mes" — a equipe no periodo.
       *
       * ================================================================
       * QUEM VENDEU NO PERIODO APARECE, TENHA SAIDO OU NAO — 28/09/2026.
       *
       * Ate aqui esta ferramenta percorria `vendedoras.listar({ativo:true})`
       * e perguntava o desempenho de uma por uma. Duas coisas erradas nisso,
       * e a primeira e a que o Lucas apontou:
       *
       * 1. VENDA E HISTORICO. Quem saiu em setembro vendeu em agosto, e o
       *    agosto dela e da equipe. Listando so as ativas, o ranking de um
       *    mes passado MUDAVA quando alguem era desligado — e encolhia. Na
       *    base, em 28/09: quatro desligadas respondiam por 29,7% de agosto,
       *    e o panorama daquele mes simplesmente nao as mostrava.
       *
       * 2. UMA CONSULTA POR VENDEDORA. Com 23 na equipe seriam 23 idas ao
       *    banco para montar uma frase.
       *
       * O `ranking` resolve as duas: uma consulta so, com `JOIN vendedoras`
       * sem filtro de ativo e `HAVING count(saida) > 0` — ou seja, QUEM
       * VENDEU, e a devolucao ja abatida na vendedora certa.
       *
       * AS ATIVAS SEM VENDA CONTINUAM ENTRANDO, no fim da lista. "Quem esta
       * atras" e pergunta legitima, e omitir o zero esconderia a resposta —
       * mas so faz sentido para quem ainda trabalha aqui: "Fulana (saiu):
       * nenhuma venda" seria ruido puro.
       * ================================================================
       */
      /**
       * "Quem mais vende brinco?" — 28/09/2026.
       *
       * ================================================================
       * A FAMILIA E CONFERIDA ANTES DE CONSULTAR, e a recusa LISTA as que
       * existem.
       *
       * O modelo escreve a familia a partir do que a pessoa falou, e as duas
       * linguas nao batem: ela diz "bracelete" e o catalogo tem "PULSEIRA".
       * Consultando direto, "bracelete" devolveria zero linhas — e zero e
       * indistinguivel de "ninguem vendeu bracelete neste periodo".
       *
       * Devolver a lista das familias transforma um beco numa pergunta: a
       * agente volta com "temos brinco, anel, colar... qual delas?" em vez de
       * "ninguem vendeu isso".
       * ================================================================
       */
      gestaoPorFamilia: async ({ familia, limite, mes, periodo, de, ate }) => {
        const familias = await this.listarProdutos.familias();
        const casada = familias.find(
          (f) => f.toUpperCase() === familia.trim().toUpperCase(),
        );
        if (!casada) {
          return { status: 'FAMILIA_DESCONHECIDA', linhas: [], familias };
        }

        // ================================================================
        // O MES RECORRENTE MANDA EM TUDO, e vem antes das datas.
        //
        // "Quem mais vende brinco em outubro" nao pergunta por um outubro —
        // pergunta pelos outubros. E um corte que atravessa os anos, e nao
        // uma janela: se `mes` veio, `de`/`ate` e `periodo` nao se aplicam.
        //
        // A RESPOSTA VEM QUEBRADA POR ANO, e nao somada: "em outubro de 2025
        // foi essa, em 2024 foi essa" e o que a pergunta procura. O total dos
        // tres outubros esconderia a virada.
        // ================================================================
        if (mes && mes >= 1 && mes <= 12) {
          const porAno = await this.consultarVendas.porFamiliaNoMes(
            casada,
            mes,
            limite ?? 1,
          );
          const daEquipe = porAno.filter((l) => alcanca(l.vendedoraId));

          return {
            status: 'OK',
            linhas: daEquipe.map(
              (l) =>
                `${MESES[mes - 1]}/${l.ano} — ${l.nome}: ${pecas(l.quantidade, casada)}, ${moeda(l.valor)}`,
            ),
          };
        }

        const datas = datasDeRecorte(de, ate);
        const linhas = datas
          ? await this.consultarVendas.porFamiliaEntre(
              casada,
              datas.de,
              datas.ate,
              limite ?? LIMITE_PADRAO,
            )
          : (
              await this.consultarVendas.porFamilia(
                casada,
                periodo ?? 'MES',
                limite ?? LIMITE_PADRAO,
              )
            ).linhas;

        // O RECORTE DE EQUIPE, como no panorama: sem ele, "quem vende mais
        // brinco" devolveria a loja para a gerente de um time so.
        const daEquipe = linhas.filter((l) => alcanca(l.vendedoraId));

        return {
          status: 'OK',
          linhas: daEquipe.map(
            (l) => `${l.nome}: ${pecas(l.quantidade, casada)}, ${moeda(l.valor)}`,
          ),
        };
      },

      gestaoPanorama: async ({ periodo, de, ate }) => {
        // Teto alto: o ranking corta por limite, e aqui a lista e a equipe
        // inteira. Sem isto, a vendedora de menor faturamento sumiria da
        // comparacao sem nada dizer.
        const datas = datasDeRecorte(de, ate);
        const ranking = datas
          ? await this.consultarVendas.rankingEntre(
              datas.de,
              datas.ate,
              LIMITE_MAXIMO,
            )
          : (await this.consultarVendas.ranking(periodo ?? 'MES', LIMITE_MAXIMO))
              .linhas;

        // O RECORTE DE EQUIPE. Esta ferramenta nao passa pelo `comVendedora`
        // — ela nao resolve nome, percorre lista —, entao a checagem e
        // explicita. E a mais importante das tres: sem ela, "quem vendeu
        // mais" devolveria o ranking da LOJA para a gerente de um time so.
        const venderam = ranking.filter((r) => alcanca(r.vendedoraId));

        const linhas = venderam.map(
          (r) =>
            `${r.nome}: ${r.quantidade} ${r.quantidade === 1 ? 'venda' : 'vendas'}, ${moeda(r.valor)}`,
        );

        // As que ainda trabalham aqui e nao venderam, no fim.
        const comVenda = new Set(venderam.map((r) => r.vendedoraId));
        const ativas = await this.vendedoras.listar({ ativo: true });
        for (const v of ativas) {
          if (!v.id || comVenda.has(v.id) || !alcanca(v.id)) continue;
          linhas.push(`${v.nome}: nenhuma venda`);
        }

        return { linhas };
      },

      gestaoAgendar: async ({ cliente, vendedora, quandoIso, modo }) => {
        const alvo = await this.resolverVendedora.execute(vendedora);
        if (alvo.status === 'AMBIGUA') {
          return {
            mensagem:
              `Mais de uma vendedora com esse nome: ${alvo.nomes.join(', ')}. ` +
              'Pergunte de qual se trata antes de agendar.',
          };
        }
        if (alvo.status === 'NAO_ENCONTRADA') {
          return {
            mensagem:
              'Não há vendedora com esse nome. ' +
              (alvo.sugestoes.length
                ? `A equipe ativa é: ${alvo.sugestoes.join(', ')}.`
                : ''),
          };
        }

        const r = await this.agendarGestao.execute({
          vendedoraId: alvo.id,
          vendedoraNome: alvo.nome,
          vendedoraCodigoErp: alvo.codigoErp,
          nomeCliente: cliente,
          quandoIso,
          modo,
          solicitanteNome: solicitante ?? null,
        });

        return { mensagem: mensagemDoAgendamento(r) };
      },

      gestaoFeedbacks: async ({ vendedora, cliente, dias }) => {
        let total = 0;
        const r = await this.comVendedora(equipe, vendedora, async (id) => {
          const desde = new Date();
          desde.setDate(desde.getDate() - (dias ?? DIAS_PADRAO_FEEDBACK) + 1);
          desde.setHours(0, 0, 0, 0);

          const pagina = await this.auditoria.listar({
            vendedoraId: id,
            clienteNome: cliente,
            de: desde,
            limit: MAXIMO_FEEDBACKS,
          });
          total = pagina.total;

          // UM cliente nomeado, UM episodio: vale abrir a linha do tempo
          // inteira. O que ela contou em duas conversas diferentes sao dois
          // relatos, e mostrar so o ultimo esconderia metade da historia.
          if (cliente && pagina.itens.length === 1) {
            const d = await this.auditoria.detalhe(pagina.itens[0].id);
            const falas = d.interacoes.filter((i) => i.relato);
            total = falas.length;
            if (falas.length === 0) {
              return [
                d.clienteNome +
                  ' — ' +
                  rotuloEtapa(d.etapa) +
                  ', sem feedback registrado ainda',
              ];
            }
            return falas.map(
              (i) =>
                d.clienteNome +
                ', ' +
                formatarQuando(i.ocorridoEm ?? i.criadoEm) +
                ' (' +
                rotuloEtapa(d.etapa) +
                '): "' +
                i.relato +
                '"',
            );
          }

          return pagina.itens.map((i) =>
            i.ultimoRelato
              ? i.clienteNome +
                ', ' +
                formatarQuando(i.ultimaAtividadeEm ?? i.abertoEm) +
                ' (' +
                rotuloEtapa(i.etapa) +
                '): "' +
                i.ultimoRelato +
                '"'
              : i.clienteNome +
                ' — ' +
                rotuloEtapa(i.etapa) +
                ', ainda sem feedback' +
                (i.aguardandoRelato
                  ? ' (cobranca enviada, aguardando resposta)'
                  : ''),
          );
        });
        return { ...r, total };
      },

      // A FILA QUE NINGUEM VE. O aviso de lead sai UMA VEZ SO, entao um lead
      // que a usuaria nao encaminhou na hora nao volta a se anunciar — e nao
      // existe tela de leads. Sem isto, ele fica invisivel no banco.
      //
      // A IDADE E O PONTO, e nao os nomes: e ela que separa "chegou agora" de
      // "esta parado desde terca".
      gestaoLeads: async () => {
        const fila = await this.leads.listarAguardandoGestao(MAXIMO_LEADS);
        return {
          linhas: fila.map((l) => {
            const partes = [l.nome?.trim() || 'sem nome informado'];
            if (l.produtosDesejados) partes.push(l.produtosDesejados);
            partes.push(esperaLegivel(l.direcionadoGestaoEm ?? l.criadoEm));
            return partes.join(' — ');
          }),
        };
      },

      // A PERGUNTA QUE O AVISO PROVOCA. Ele termina em "para qual vendedora
      // encaminho?", e sem isto a resposta era "nao tenho como listar" — a
      // pergunta nascendo do sistema e morrendo nele.
      //
      // DISPONIVEL PRIMEIRO, mas ninguem fica de fora: esconder quem esta de
      // ferias faria a usuaria procurar um nome que ela sabe que existe.
      gestaoVendedoras: async () => {
        const todas = await this.vendedoras.listar({ ativo: true });
        // SO AS DA EQUIPE. Esta ferramenta responde "para qual vendedora
        // encaminho?" — oferecer um nome de outro time faria a gerente
        // encaminhar para fora do alcance dela, e o erro so apareceria
        // depois, quando a ferramenta de encaminhar recusasse o mesmo nome.
        //
        // SEM RECORTE, A LISTA PASSA INTEIRA — inclusive registro sem `id`.
        // Escrever `v.id && alcanca(v.id)` parecia equivalente e nao era:
        // derrubava quem nao tem id mesmo quando nao ha equipe nenhuma, o que
        // muda o comportamento historico de todo mundo por causa de uma regra
        // que nao se aplica a ninguem ainda.
        //
        // COM recorte, quem nao tem id fica de fora: nao da para conferir se
        // ela pertence, e o lado seguro do "nao sei" aqui e excluir.
        const ativas =
          equipe === null ? todas : todas.filter((v) => !!v.id && alcanca(v.id));
        const ordenadas = [
          ...ativas.filter((v) => v.statusDisponibilidade === 'DISPONIVEL'),
          ...ativas.filter((v) => v.statusDisponibilidade !== 'DISPONIVEL'),
        ];
        return {
          linhas: ordenadas.map((v) => {
            const partes = [v.nome];
            if (v.statusDisponibilidade !== 'DISPONIVEL') {
              partes.push(DISPONIBILIDADE_LEGIVEL[v.statusDisponibilidade]);
            }
            if (v.especialidades.length > 0) {
              partes.push(v.especialidades.join(', '));
            }
            return partes.join(' — ');
          }),
        };
      },

      // A RESPOSTA AO AVISO DE LEAD NOVO. Nao passa por aqui nada que decida
      // quem atende: quem escolhe e a usuaria, e o use case so resolve o nome.
      gestaoEncaminharLead: async ({ vendedora, lead, quando }) =>
        this.encaminharLead.execute({ vendedora, lead, quando }),

      gestaoCarteiraDoCliente: async ({ cliente }) => {
        const achados = await this.clientes.buscarPorNomeParcial(
          cliente,
          MAXIMO_CLIENTES_HOMONIMOS + 1,
        );
        if (achados.length === 0) {
          return { status: 'NAO_ENCONTRADO', linhas: [] };
        }

        const linhas: string[] = [];
        for (const c of achados.slice(0, MAXIMO_CLIENTES_HOMONIMOS)) {
          const codigo = c.vendedoraCodigoErp;
          let dono = 'sem vendedora vinculada';
          if (codigo) {
            const v = await this.vendedoras.buscarPorCodigoErp(codigo);
            dono = v
              ? `carteira de ${v.nome}`
              : `vendedora ${codigo} (não cadastrada)`;
          }
          linhas.push(
            `${c.nome}${c.codigoErp ? ` (código ${c.codigoErp})` : ''} — ${dono}`,
          );
        }

        return { status: achados.length > 1 ? 'AMBIGUO' : 'OK', linhas };
      },
      /**
       * O DIA DE UMA VENDEDORA NUMA FRASE — a pergunta "como esta o canal da
       * Marina hoje".
       *
       * ====================================================================
       * ISTO NAO LE O WHATSAPP DELA. LE O REGISTRO DO QUE PASSOU POR ELE.
       *
       * A diferenca importa e nao e sutil. Os numeros aqui — com quantas
       * clientes falou, o que marcou, o que vendeu, o que ficou devendo — sao
       * EXATOS e custam uma consulta. Dizer O QUE a cliente quer exigiria ler
       * o texto das conversas, que e outra coisa: custa por conversa lida e
       * ainda nao existe.
       *
       * Quem responder "a Marina esta negociando um anel" a partir DESTES
       * dados estaria inventando. O que estes dados sustentam e "a Marina
       * falou com quatro clientes e marcou duas".
       * ====================================================================
       */
      gestaoDiaDaVendedora: async ({ vendedora, dia }) =>
        this.comVendedora(equipe, vendedora, async (id) => {
          const pontos = await this.linha.doDia(id, dia);
          if (pontos.length === 0) return [];
          return resumoDoDia(pontos);
        }),

      /**
       * O FUNIL AGORA — 21/09/2026. O espelho da carteira da Elena.
       *
       * SEM NOME, A LOJA INTEIRA; com nome, so aquela vendedora. E a
       * assimetria de sempre, e ela e o motivo de esta ferramenta ser OUTRA e
       * nao a mesma da vendedora com um campo a mais: la nao existe "de
       * quem", entao nenhuma frase alcanca a carteira de uma colega.
       *
       * NAO FALA DE VENDA NEM DE VALOR. Este numero e sobre onde as pessoas
       * estao, nao sobre quanto entrou — misturar os dois aqui faria parecer
       * que "5 em negociacao" tem um valor associado, e nao tem.
       */
      /**
       * O PANORAMA DE LEADS — 21/09/2026.
       *
       * ====================================================================
       * A GESTAO VE TUDO, E ISSO E DECISAO DO LUCAS.
       *
       * O AVISO de lead novo omite o telefone de proposito — o ADM nao liga
       * para ninguem, e um numero solto numa lista que ele nao pediu so
       * serviria para ser repassado adiante. Aqui e o oposto: ele PERGUNTOU,
       * e a resposta traz nome, telefone, o que a pessoa procura e a ocasiao.
       *
       * Pedir e receber e diferente de receber sem pedir, e e so isso que
       * separa os dois textos.
       * ====================================================================
       *
       * COM NOME, os leads daquela vendedora. SEM NOME, a fila inteira:
       * quantos em cada estado, quem espera encaminhamento e quantos foram
       * para cada uma.
       */
      /**
       * AS METRICAS DE ATENDIMENTO — ANA-08 a ANA-12, 29/09/2026.
       *
       * ====================================================================
       * AS CINCO NUMA FERRAMENTA SO.
       *
       * "Como foi o mes?" nao e cinco perguntas: e uma. Cinco ferramentas
       * separadas fariam o modelo encadear cinco chamadas — cinco idas ao
       * banco e cinco turnos pagos — para montar cinco linhas de texto.
       *
       * A AMOSTRA VAI EM TODA MEDIA, e isso e o mais importante aqui. Com um
       * lead e um celular conectado na base, toda media desta safra sai de
       * dois ou tres casos: sem o `n` ao lado, a anedota chega com cara de
       * indicador e a gestao decide em cima dela.
       * ====================================================================
       */
      gestaoMetricas: async ({ de, ate, periodo }) => {
        const recorte = datasDeRecorte(de, ate);
        const janela = recorte ?? janelaDoPeriodo(periodo);

        const r = await this.metricas.execute({
          de: janela.de,
          ate: janela.ate,
          vendedoraIds: equipe ?? null,
        });

        const linhas: string[] = [
          fraseDaConversao(r.conversao),
          comAmostra(r.primeiraResposta, 'Tempo médio até a primeira resposta'),
          comAmostra(r.duracaoDoAtendimento, 'Duração média do atendimento'),
          comAmostra(r.ateFecharVenda, 'Tempo médio até fechar a venda'),
        ];

        if (r.leadsPorVendedora.length > 0) {
          linhas.push(
            'Leads por vendedora: ' +
              r.leadsPorVendedora
                .map((l) => `${l.nome} ${l.quantos}`)
                .join(', ') +
              '.',
          );
        } else {
          linhas.push('Nenhum lead novo no período.');
        }

        if (r.interacoesPorVendedora.length > 0) {
          linhas.push(
            'Interações por vendedora: ' +
              r.interacoesPorVendedora
                .map(
                  (i) =>
                    `${i.nome} ${i.total} (${i.daVendedora} dela) em ${i.atendimentos} atendimento(s)`,
                )
                .join(', ') +
              '.',
          );
        } else {
          linhas.push('Nenhuma interação registrada no período.');
        }

        return { status: 'OK' as const, de: janela.de, ate: janela.ate, linhas };
      },

      /**
       * OS CINCO RANKINGS — ANA-14, 29/09/2026.
       *
       * ====================================================================
       * O TEMPO DE RESPOSTA SAI NO RELOGIO DA LOJA, COM O CORRIDO AO LADO.
       *
       * Cliente escreve 23h40 e a vendedora responde 8h10: corrido sao 8h30 e
       * ela e a pior da equipe; no relogio da loja sao 10 minutos e ela e a
       * melhor. Como o telefone corporativo recebe a qualquer hora, inclusive
       * no fim de semana, ranquear pelo corrido ordenaria por QUANDO a
       * cliente escreveu — nao por como a vendedora atendeu.
       *
       * O corrido vai junto porque e ele que mostra quem responde fora do
       * expediente: esforco que o relogio da loja apaga.
       * ====================================================================
       */
      gestaoRankings: async ({ eixo, de, ate, periodo }) => {
        const recorte = datasDeRecorte(de, ate);
        const janela = recorte ?? janelaDoPeriodo(periodo);

        const r = await this.rankings.execute({
          de: janela.de,
          ate: janela.ate,
          vendedoraIds: equipe ?? null,
        });

        const tempo = (p: PostoDeRanking) =>
          `${p.nome} ${emPortugues(p.valor)}` +
          (p.corrido !== undefined && p.corrido !== p.valor
            ? ` (${emPortugues(p.corrido)} corridos)`
            : '') +
          ` — ${p.amostra} caso(s)`;

        const contagem = (p: PostoDeRanking, unidade: string) =>
          `${p.nome} ${p.valor} ${unidade}`;

        const eixos: Record<string, () => string> = {
          RESPOSTA: () =>
            r.respondeMaisRapido.length
              ? 'Responde mais rápido: ' +
                r.respondeMaisRapido.map(tempo).join('; ') + '.'
              : 'Ainda não há vendedora com casos suficientes para ranquear tempo de resposta.',
          FECHAMENTO: () =>
            r.fechaMaisRapido.length
              ? 'Fecha venda em menos tempo: ' +
                r.fechaMaisRapido.map(tempo).join('; ') + '.'
              : 'Nenhum atendimento fechado em venda no período — não dá para ranquear.',
          INTERACOES: () =>
            r.maisInterage.length
              ? 'Mais interage: ' +
                r.maisInterage
                  .map((p) => `${p.nome} ${p.valor} interação(ões) em ${p.amostra} atendimento(s)`)
                  .join('; ') + '.'
              : 'Nenhuma interação registrada no período.',
          CONVERSAO: () =>
            r.maisConverte.length
              ? 'Mais converte: ' +
                r.maisConverte
                  .map((p) => `${p.nome} ${p.valor}% em ${p.amostra} lead(s) decidido(s)`)
                  .join('; ') + '.'
              : 'Nenhuma vendedora tem leads com desfecho suficientes para ranquear conversão.',
          LEADS: () =>
            r.maisLeads.length
              ? 'Recebe mais leads: ' +
                r.maisLeads.map((p) => contagem(p, 'lead(s)')).join('; ') + '.'
              : 'Nenhum lead atribuído no período.',
        };

        const linhas = eixo
          ? [eixos[eixo]()]
          : Object.values(eixos).map((f) => f());

        // ==================================================================
        // QUEM FICOU DE FORA APARECE, E ISSO NAO E DETALHE.
        //
        // Sem esta linha, a vendedora com um unico atendimento simplesmente
        // NAO EXISTE no ranking — e quem le conclui que ela nao trabalhou,
        // quando a verdade e que ela nao tem casos suficientes para uma media
        // significar alguma coisa.
        // ==================================================================
        if (r.semAmostra.length > 0) {
          linhas.push(
            `Fora dos rankings de média por terem menos de ${MINIMO_PARA_RANQUEAR} casos: ` +
              `${r.semAmostra.join(', ')}. Isso não quer dizer que não atenderam.`,
          );
        }

        return { status: 'OK' as const, de: janela.de, ate: janela.ate, linhas };
      },

      /**
       * A ANÁLISE DE TOM — ANA-15, 29/09/2026.
       *
       * ====================================================================
       * CADA RECUSA DIZ O MOTIVO, E ISSO NÃO É POLIDEZ.
       *
       * "Não encontrei" cobre quatro situações com consertos diferentes: a
       * vendedora não existe, o celular dela não está conectado, a cliente
       * não está cadastrada, ou não há conversa entre as duas. Quem pergunta
       * age diferente em cada uma — e com uma única frase genérica conclui,
       * quase sempre, que não houve atendimento.
       * ====================================================================
       */
      gestaoTom: async ({ vendedora, cliente }) =>
        this.comVendedora(equipe, vendedora, async (id) => {
          const r = await this.tom.execute(id, cliente);

          switch (r.status) {
            case 'OK':
              return r.linhas;
            case 'VENDEDORA_SEM_CELULAR':
              return [
                'O número dela não está conectado, então não dá para ler a conversa. ' +
                  'Diga isso — não conclua que não houve atendimento.',
              ];
            case 'CLIENTE_NAO_ENCONTRADO':
              return [`Não achei nenhuma cliente com esse nome (${cliente}).`];
            case 'SEM_CONVERSA':
              return [
                'Não há conversa entre as duas no celular dela. Pode ser que ' +
                  'nunca tenha havido, ou que seja antiga demais e já tenha saído do aparelho.',
              ];
            default:
              return ['Não consegui ler a conversa agora. Vale tentar de novo.'];
          }
        }),

      gestaoPanoramaLeads: async ({ vendedora }) => {
        if (vendedora && vendedora.trim()) {
          return this.comVendedora(equipe, vendedora, async (_id, codigoErp) => {
            if (!codigoErp) return [];
            // ============================================================
            // A GESTAO VE TUDO — INCLUSIVE O QUE ELA JA RESOLVEU.
            //
            // O `false` e o que separa esta leitura da lista DELA. A da
            // vendedora e uma FILA ("o que eu tenho para fazer") e por isso
            // esconde o resolvido; esta e uma PRESTACAO DE CONTAS ("como foi
            // com os leads que mandei"), e ali o resolvido E a resposta.
            //
            // Sem isto, perguntar "ele deu baixa em algum?" devolvia "nao tem
            // nenhum lead" — que e verdade sobre a fila e mentira sobre a
            // pergunta. Aconteceu em 22/09/2026, com o Lucas do outro lado.
            // ============================================================
            const achados = await this.leads.listarPorVendedora(
              codigoErp,
              MAXIMO_LEADS + 1,
              false,
            );
            const linhas = achados
              .slice(0, MAXIMO_LEADS)
              .map((l) => linhaDoLead(l, true));
            // Teto silencioso mente por omissao — ver a licao da carteira.
            if (achados.length > MAXIMO_LEADS) {
              linhas.push(
                `Ha mais de ${MAXIMO_LEADS}; estes sao os mais recentes. Diga isso.`,
              );
            }
            return linhas;
          });
        }

        const [panorama, esperando] = await Promise.all([
          this.leads.panoramaDeLeads(),
          this.leads.listarAguardandoGestao(MAXIMO_LEADS),
        ]);

        if (panorama.total === 0) return { status: 'OK', linhas: [] };

        const linhas = [
          `${panorama.total} ${panorama.total === 1 ? 'lead' : 'leads'} no total: ` +
            panorama.porEstado
              .map((e) => `${e.quantos} ${estadoLegivel(e.estado)}`)
              .join(', ') +
            '.',
        ];

        // A FILA VEM COM NOME E TELEFONE: e sobre ela que o ADM decide agora.
        for (const lead of esperando) {
          linhas.push(`Esperando encaminhamento: ${linhaDoLead(lead, true)}`);
        }

        // E o codigo da vendedora vira NOME — ninguem decide olhando "012".
        if (panorama.porVendedora.length > 0) {
          const equipe = await this.vendedoras.listar({});
          const nomePorCodigo = new Map(
            equipe
              .filter((v) => v.codigoErp)
              .map((v) => [v.codigoErp as string, v.nome]),
          );
          for (const v of panorama.porVendedora) {
            linhas.push(
              `${nomePorCodigo.get(v.codigo) ?? v.codigo}: ${v.quantos} ` +
                `${v.quantos === 1 ? 'lead encaminhado' : 'leads encaminhados'}`,
            );
          }
        }

        return { status: 'OK', linhas };
      },

      gestaoFunil: async ({ vendedora }) => {
        if (vendedora && vendedora.trim()) {
          return this.comVendedora(equipe, vendedora, async (id) => {
            const r = await this.auditoria.resumo({
              apenasAbertos: true,
              vendedoraId: id,
            });
            const dela = r.vendedoras[0];
            if (!dela) return [];
            const linhas = [fraseDoFunil(dela.total, dela.porEtapa)];
            if (dela.aguardandoRelato > 0) {
              linhas.push(
                dela.aguardandoRelato === 1
                  ? '1 deles esta esperando o relato dela'
                  : `${dela.aguardandoRelato} deles estao esperando o relato dela`,
              );
            }
            return linhas;
          });
        }

        // A LOJA — OU A EQUIPE. Uma linha do todo, e depois uma por vendedora:
        // e a leitura que a gestao faz, primeiro o tamanho, depois de quem e.
        const r = await this.auditoria.resumo({ apenasAbertos: true });

        // ================================================================
        // O RECORTE E APLICADO DEPOIS DA CONSULTA, e aqui isso e correto —
        // ao contrario do `itens_mais_vendidos`, onde recusar depois de
        // consultar deixaria o dado carregado a um `return` de distancia.
        //
        // A diferenca e o que a consulta traz: ali era o FATURAMENTO da
        // loja; aqui e a contagem de atendimentos abertos por vendedora, ja
        // quebrada por pessoa. Filtrar a lista e a operacao natural, e nao
        // ha um agregado da loja para vazar — o total e recomputado abaixo,
        // a partir das linhas que sobraram.
        // ================================================================
        const daEquipe = r.vendedoras.filter((v) => alcanca(v.vendedoraId));
        const total =
          equipe === null
            ? r.total
            : daEquipe.reduce((soma, v) => soma + v.total, 0);

        if (total === 0) return { status: 'OK', linhas: [] };

        const sujeito = equipe === null ? 'A loja' : 'A equipe';
        const porEtapa =
          equipe === null ? r.porEtapa : somarEtapas(daEquipe.map((v) => v.porEtapa));

        const linhas = [`${sujeito} tem ${fraseDoFunil(total, porEtapa)}.`];
        const esperando = daEquipe.reduce(
          (soma, v) => soma + v.aguardandoRelato,
          0,
        );
        if (esperando > 0) {
          linhas.push(
            esperando === 1
              ? '1 deles esta esperando o relato da vendedora'
              : `${esperando} deles estao esperando o relato da vendedora`,
          );
        }
        for (const v of [...daEquipe].sort((a, b) => b.total - a.total)) {
          linhas.push(
            `${v.nome}: ${fraseDoFunil(v.total, v.porEtapa)}` +
              (v.aguardandoRelato > 0
                ? ` — ${v.aguardandoRelato} esperando relato`
                : ''),
          );
        }
        return { status: 'OK', linhas };
      },

    };
  }

  /**
   * Resolve o nome, confere o alcance e so entao consulta.
   *
   * Um lugar so faz isso para as NOVE leituras por vendedora, entao as nove se
   * comportam igual — inclusive na ambiguidade, que e onde um palpite sairia
   * caro: dar o numero da vendedora errada e um erro que ninguem percebe na
   * hora.
   *
   * ==========================================================================
   * O RECORTE DE EQUIPE ENTRA AQUI, E POR ISSO VALE NAS NOVE DE UMA VEZ —
   * 28/09/2026.
   *
   * Cada handler poderia conferir por conta propria. Seriam nove checagens
   * identicas, e a decima ferramenta — a que alguem acrescentar no ano que vem
   * — nasceria sem nenhuma. Aqui ela nasce protegida sem o autor saber que
   * existe uma regra de equipe.
   *
   * FORA DA EQUIPE RESPONDE `NAO_ENCONTRADA`, e nao um erro de permissao. A
   * gerente de um time nao precisa saber quem esta no outro: "nao achei essa
   * vendedora" e verdade do ponto de vista dela, e "voce nao pode ver a
   * Fulana" confirmaria que a Fulana existe. Mesma escolha do silencio para
   * numero desconhecido no roteador.
   *
   * AS SUGESTOES TAMBEM SAO RECORTADAS pelo mesmo motivo — devolver "voce quis
   * dizer Beatriz?" com uma vendedora de outro time entregaria pela lista o
   * que a recusa acabou de esconder.
   * ==========================================================================
   */
  private async comVendedora(
    equipe: string[] | null,
    nome: string,
    consulta: (
      vendedoraId: string,
      codigoErp: string | null,
    ) => Promise<string[]>,
  ): Promise<GestaoLeituraResultado> {
    const r = await this.resolverVendedora.execute(nome);
    if (r.status === 'AMBIGUA')
      return { status: 'AMBIGUA', linhas: [], nomes: r.nomes };
    if (r.status === 'NAO_ENCONTRADA') {
      return { status: 'NAO_ENCONTRADA', linhas: [], nomes: r.sugestoes };
    }
    if (equipe !== null && !equipe.includes(r.id)) {
      return { status: 'NAO_ENCONTRADA', linhas: [], nomes: [] };
    }
    return {
      status: 'OK',
      vendedora: r.nome,
      linhas: await consulta(r.id, r.codigoErp),
    };
  }
}

/**
 * A frase que volta ao modelo depois de tentar agendar.
 *
 * Pronta do servidor, e nao um objeto para ele descrever: carrega nome de
 * cliente, nome de vendedora e horario — exatamente o que ele completaria ou
 * arredondaria se tivesse liberdade.
 */
export function mensagemDoAgendamento(r: ResultadoAgendamentoGestao): string {
  switch (r.status) {
    case 'AGENDADO': {
      const base = r.transferido
        ? `Pronto: ${r.cliente} foi transferido para a carteira de ${r.vendedora} e o contato ficou marcado para ${formatarQuando(r.quando)}.`
        : `Pronto: contato com ${r.cliente} marcado na agenda de ${r.vendedora} para ${formatarQuando(r.quando)}.`;

      // O QUE ACONTECE COM A VENDEDORA, dito de saida. Quem marca precisa saber
      // se ela ja foi avisada — senao pergunta de novo, ou pior, avisa por
      // fora e ela recebe a mesma coisa duas vezes.
      const lembrete = r.temLembrete
        ? ` Ela recebe um lembrete ${MINUTOS_LEMBRETE} minutos antes e eu pergunto como foi depois.`
        : ' Eu pergunto como foi depois.';

      switch (r.aviso) {
        case 'ENVIADO':
          return `${base} Avisei ${primeiroNome(r.vendedora)} agora.${lembrete}`;
        case 'REMARCADO':
          return `${base} Avisei ${primeiroNome(r.vendedora)} da mudança de horário.${lembrete}`;
        case 'JA_SABIA':
          return `${base} Ela já tinha sido avisada desse mesmo horário, então não mandei de novo.${lembrete}`;
        case 'FALHOU':
          return (
            `${base} ATENÇÃO: não consegui avisar ${primeiroNome(r.vendedora)} agora — o WhatsApp não saiu. ` +
            (r.temLembrete
              ? `Ela ainda recebe o lembrete ${MINUTOS_LEMBRETE} minutos antes, mas avise por fora se for importante.`
              : 'Avise por fora, porque não dá tempo de o lembrete alcançá-la.')
          );
      }
      return base;
    }

    case 'VENDEDORA_SEM_WHATSAPP':
      return (
        `NÃO AGENDADO. ${r.vendedora} não tem WhatsApp interno cadastrado, então ela ` +
        `não receberia nem o aviso nem o lembrete — e o contato ficaria marcado só ` +
        `no sistema. Peça para cadastrarem o número dela antes de marcar.`
      );

    case 'CARTEIRA_DE_OUTRA':
      return (
        `ATENÇÃO, nada foi agendado ainda. ${r.cliente} está na carteira de ${r.donaAtual}, ` +
        `e não de ${r.vendedoraDestino}. Pergunte se é para marcar apenas este atendimento — ` +
        `o cliente continua com ${r.donaAtual} — ou se é para TRANSFERIR o cliente para a ` +
        `carteira de ${r.vendedoraDestino}, o que vale dali em diante para tudo. Depois da ` +
        `resposta, chame a ferramenta de novo com os mesmos dados e o modo escolhido.`
      );

    case 'CLIENTE_NAO_ENCONTRADO':
      return 'Não encontrei esse cliente. Confirme o nome antes de tentar de novo.';

    case 'CLIENTE_AMBIGUO':
      return (
        `Mais de um cliente com esse nome:\n${r.opcoes.map((o) => `- ${o}`).join('\n')}\n\n` +
        'Mostre as opcoes com o codigo e pergunte qual e. Quando responderem, ' +
        'chame a ferramenta de novo passando o CODIGO no lugar do nome.'
      );

    case 'HORARIO_INVALIDO':
      return 'O horário não serve — precisa ser no futuro e dentro de seis meses. Confirme a data e a hora.';

    case 'ATENDIMENTO_DE_OUTRA_PESSOA':
      // O "NAO AGENDADO" na frente nao e enfeite. Em 21/08 este caso voltou
      // com o texto explicando a trava, e o modelo respondeu "Feito,
      // transferida" — anunciou sucesso por cima de um resultado que dizia o
      // contrario. O veredito vem primeiro; a explicacao, depois.
      return (
        `NÃO AGENDADO. ${r.cliente} tem um atendimento em curso com ${r.vendedora}, ` +
        `e não mexi nele para não apagar o histórico. ` +
        (r.transferido
          ? `A CARTEIRA foi transferida, isso sim — o cliente já é da nova vendedora. `
          : `A carteira também não mudou. `) +
        `Diga exatamente isso e pergunte como prosseguir. NUNCA diga que o contato foi marcado.`
      );
  }
}

/**
 * A janela de um periodo dito em palavra — para as metricas (ANA-08 a 12).
 *
 * O PADRAO E O MES, e nao HOJE como nas vendas. Media de tempo de atendimento
 * "de hoje" quase sempre sai de zero ou um caso; o mes e a menor janela em que
 * o numero significa alguma coisa nesta loja, que vende em ~12 dias por mes.
 *
 * MES e ANO sao do CALENDARIO, como no resto do sistema: quem pergunta "como
 * foi o mes" compara com a meta do mes, nao com trinta dias corridos.
 */
function janelaDoPeriodo(
  periodo: string | undefined,
  agora: Date = new Date(),
): { de: Date; ate: Date } {
  const de = new Date(agora);
  de.setHours(0, 0, 0, 0);

  switch (periodo) {
    case 'HOJE':
      break;
    case 'ONTEM': {
      de.setDate(de.getDate() - 1);
      const ate = new Date(de);
      ate.setHours(23, 59, 59, 999);
      return { de, ate };
    }
    case 'SEMANA':
      de.setDate(de.getDate() - 6);
      break;
    case 'ANO':
      de.setMonth(0, 1);
      break;
    case 'MES':
    default:
      de.setDate(1);
      break;
  }
  return { de, ate: agora };
}

export function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

/**
 * O saldo da peca em palavras, no nivel que quem pergunta pode ver.
 *
 * SEM PERMISSAO A FRASE NAO DIZ QUE HA UMA — ela responde a pergunta que
 * importa ("consigo atender com essa peca?") e para ali. Escrever "disponível
 * (quantidade restrita)" seria pior que o silencio: anuncia que existe um
 * numero, convida a insistir, e a insistencia nao leva a lugar nenhum porque
 * o dado nao chega ate aqui.
 */
/**
 * Soma as contagens por etapa de varias vendedoras numa so.
 *
 * Existe porque o `resumo` da auditoria ja devolve o agregado DA LOJA, e com
 * recorte de equipe ele nao serve: "a equipe tem X em negociacao" precisa somar
 * apenas as linhas que sobraram do filtro. Reaproveitar o total da loja ali
 * diria da equipe um numero que e do todo — e ele seria PLAUSIVEL, que e o
 * pior tipo de numero errado.
 */
function somarEtapas(porEtapa: ContagemPorEtapa[]): ContagemPorEtapa {
  return porEtapa.reduce<ContagemPorEtapa>(
    (soma, atual) => {
      for (const chave of Object.keys(soma) as (keyof ContagemPorEtapa)[]) {
        soma[chave] += atual[chave];
      }
      return soma;
    },
    {
      PRIMEIRO_CONTATO: 0,
      EM_NEGOCIACAO: 0,
      REMARCADO: 0,
      SEM_CONTATO: 0,
      CONCLUIDO: 0,
      NAO_AVANCOU: 0,
    },
  );
}

function saldoEmPalavras(estoque: number, verQuantidade: boolean): string {
  if (estoque <= 0) return 'sem estoque';
  return verQuantidade ? `${estoque} em estoque` : 'disponível';
}

/** "Maria Eduarda Lima" -> "Maria". Nome inteiro na frase soa a formulario. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0];
}

export function formatarQuando(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Ha quanto tempo o lead espera, como uma pessoa diria.
 *
 * EM DIAS, e nao em horas: a decisao que a lista alimenta e "esse ai eu
 * esqueci?", e para isso a diferenca entre 3h e 5h nao muda nada. "hoje"
 * cobre o dia corrente inteiro.
 *
 * DIA DE CALENDARIO, E NAO PERIODO DE 24 HORAS — mesmo defeito que a lista da
 * vendedora tinha, achado junto com ele em 22/09/2026. Aqui doi mais: e a fila
 * de quem espera APROVACAO, e um lead de ontem as 18h aparecia como "hoje"
 * durante a manha inteira, justamente quando se decide o que ja atrasou.
 */
function esperaLegivel(desde: Date, agora = new Date()): string {
  const dias = diasDeCalendario(new Date(desde), agora);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

/**
 * Os pontos de um dia viram as linhas que a gestao le.
 *
 * ==========================================================================
 * CONTA PESSOAS, E NAO MENSAGENS.
 *
 * "Falou com 12" quando foram tres clientes e doze idas e vindas seria uma
 * leitura errada com cara de numero. O que a gestao pergunta e com QUANTAS
 * pessoas, entao o que se conta sao clientes distintos.
 *
 * O QUE FICA DE FORA: o conteudo. Nenhuma linha aqui diz o que a cliente
 * quer — isso sai de LER a conversa, e nao de contar os pontos.
 * ==========================================================================
 */
export function resumoDoDia(pontos: PontoDaLinha[]): string[] {
  const linhas: string[] = [];

  const clientesFalados = new Set(
    pontos
      .filter(
        (p) => p.tipo === 'CONTATO_CLIENTE' || p.tipo === 'RESPOSTA_VENDEDORA',
      )
      .map((p) => p.clienteId)
      .filter((id): id is string => Boolean(id)),
  );
  const escreveram = new Set(
    pontos
      .filter((p) => p.tipo === 'CONTATO_CLIENTE')
      .map((p) => p.clienteId)
      .filter((id): id is string => Boolean(id)),
  );
  const respondidas = new Set(
    pontos
      .filter((p) => p.tipo === 'RESPOSTA_VENDEDORA')
      .map((p) => p.clienteId)
      .filter((id): id is string => Boolean(id)),
  );

  if (clientesFalados.size > 0) {
    linhas.push(
      `Falou com ${clientesFalados.size} ${clientesFalados.size === 1 ? 'cliente' : 'clientes'} pelo WhatsApp.`,
    );
  }

  // QUEM ESCREVEU E NAO FOI RESPONDIDA. E o numero que a gestao procura sem
  // saber pedir, e o unico aqui que aponta uma falha.
  const semResposta = [...escreveram].filter((id) => !respondidas.has(id));
  if (semResposta.length > 0) {
    linhas.push(
      `${semResposta.length} ${semResposta.length === 1 ? 'escreveu' : 'escreveram'} e ainda nao ${semResposta.length === 1 ? 'recebeu' : 'receberam'} resposta dela.`,
    );
  }

  // Os compromissos MARCADOS no dia — com hora, que e o que a pergunta pede.
  const marcados = pontos
    .filter((p) => p.combinadoEm && p.tipo !== 'CONSIGNACAO')
    .map((p) => ({ quando: p.combinadoEm as Date, cliente: p.clienteNome }));
  if (marcados.length > 0) {
    marcados.sort((a, b) => a.quando.getTime() - b.quando.getTime());
    linhas.push(
      `Marcou ${marcados.length} ${marcados.length === 1 ? 'contato' : 'contatos'}: ` +
        marcados
          .map(
            (m) => `${m.cliente ?? 'cliente'} ${formatarQuando(m.quando)}`,
          )
          .join('; ') +
        '.',
    );
  }

  const vendas = pontos.filter((p) => p.tipo === 'VENDA');
  if (vendas.length > 0) {
    const total = vendas.reduce((s, v) => s + (v.valor ?? 0), 0);
    linhas.push(
      `Vendeu ${vendas.length} ${vendas.length === 1 ? 'vez' : 'vezes'}, ${moeda(total)} no total.`,
    );
  }

  const fechados = pontos.filter((p) => p.tipo === 'FECHAMENTO');
  const comVenda = fechados.filter((p) => p.desfecho === 'VENDA').length;
  if (fechados.length > 0) {
    linhas.push(
      `Fechou ${fechados.length} ${fechados.length === 1 ? 'atendimento' : 'atendimentos'}` +
        (comVenda > 0 ? `, ${comVenda} em venda.` : ', nenhum em venda.'),
    );
  }

  // O UNICO PONTO VERMELHO DA REGUA, e por isso vem por ultimo e nomeado: e
  // prazo vencido sem ninguem responder, nao e "deu ruim".
  const vencidos = pontos.filter((p) => p.tipo === 'EXPIRADA');
  if (vencidos.length > 0) {
    const clientes = new Set(
      vencidos.map((p) => p.clienteNome).filter(Boolean),
    );
    linhas.push(
      `${vencidos.length} ${vencidos.length === 1 ? 'cobranca venceu' : 'cobrancas venceram'} sem resposta` +
        (clientes.size > 0 ? ` (${[...clientes].join(', ')}).` : '.'),
    );
  }

  const encaminhados = pontos.filter((p) => p.tipo === 'ENCAMINHADO').length;
  if (encaminhados > 0) {
    linhas.push(
      `Recebeu ${encaminhados} ${encaminhados === 1 ? 'cliente encaminhado' : 'clientes encaminhados'}.`,
    );
  }

  return linhas;
}
