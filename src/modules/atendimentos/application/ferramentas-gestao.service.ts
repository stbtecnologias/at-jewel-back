import { Inject, Injectable } from '@nestjs/common';
import { diasDeCalendario } from '../../../shared/tempo/dias-de-calendario';
import { dataDeCorte, datasDeRecorte } from '../../../shared/tempo/recorte-de-datas';
import type { NomeComemorativo } from '../../../shared/tempo/datas-comemorativas';
import type {
  GestaoCarteiraHandler,
  GestaoEpocaHandler,
  GestaoPorEmpresaHandler,
  GestaoVendasDetalhadasHandler,
  GestaoMelhoresHandler,
  GestaoAgendarHandler,
  GestaoCarteiraDoClienteHandler,
  GestaoEncaminharLeadHandler,
  GestaoLeadsHandler,
  GestaoVendedorasHandler,
  GestaoDiaDaVendedoraHandler,
  GestaoConversasAgoraHandler,
  GestaoFeedbacksHandler,
  GestaoFunilHandler,
  GestaoMetricasHandler,
  GestaoRankingsHandler,
  GestaoCompararAnosHandler,
  GestaoCompararAnteriorHandler,
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
import { janelaDoDia } from '../../../shared/tempo/janela-do-dia';
import { CONVERSA_WHATSAPP_REPOSITORY } from '../domain/ports/injection-tokens';
import type {
  ConversaEmAndamento,
  IConversaWhatsappRepository,
} from '../domain/ports/repositories/conversa-whatsapp-repository.port';
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
import {
  CompararAnosUseCase,
  variacao,
} from '../../movimentacoes/application/use-cases/comparar-anos.use-case';
import {
  CompararPeriodoAnteriorUseCase,
  variacaoEntre,
} from '../../movimentacoes/application/use-cases/comparar-periodo-anterior.use-case';
import { ConexoesService } from '../../atendimento/application/conexoes.service';
import { WahaAdminClient } from '../../atendimento/infrastructure/whatsapp/waha-admin.client';

const MAXIMO_CLIENTES_HOMONIMOS = 5;
/** Feedbacks por resposta. Acima disso a mensagem deixa de ser lida. */
/**
 * Quantas VENDAS cabem numa resposta de WhatsApp.
 *
 * DEZ. Medido: a vendedora faz 4,9 vendas por mes na media e passa de dez em
 * 24 dos 264 meses com venda; o cliente compra 2,7 vezes na vida inteira. Dez
 * cobre a quase totalidade, e o total vem junto para que um recorte grande nao
 * pareca completo.
 */
const MAXIMO_VENDAS_DETALHADAS = 10;

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

/**
 * O que conta como "agora" numa conversa de WhatsApp — 29/09/2026.
 *
 * Trinta minutos, e o numero e do Lucas. Conversa de loja tem silencio no
 * meio: a cliente pergunta o preco, some para pensar, volta. Cinco minutos
 * diriam que ela foi embora; duas horas diriam que esta conversando quando o
 * assunto morreu no almoco.
 *
 * Acima desta janela a resposta e outra — "falou hoje", que e o
 * `dia_da_vendedora` — e por isso este numero nao vira teto de nada: quem
 * pedir "nas ultimas duas horas" recebe duas horas.
 */
const MINUTOS_CONVERSA_AGORA = 30;

/** Uma conversa do ponteiro com o nome ja resolvido. */
export interface ConversaComNome {
  vendedoraId: string;
  ultimaMensagemEm: Date;
  /** `null` = numero que o sistema ainda NAO identificou. */
  cliente: string | null;
}

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
  gestaoEpoca: GestaoEpocaHandler;
  gestaoPorEmpresa: GestaoPorEmpresaHandler;
  gestaoVendasDetalhadas: GestaoVendasDetalhadasHandler;
  gestaoMelhores: GestaoMelhoresHandler;
  gestaoFeedbacks: GestaoFeedbacksHandler;
  gestaoDiaDaVendedora: GestaoDiaDaVendedoraHandler;
  gestaoConversasAgora: GestaoConversasAgoraHandler;
  gestaoFunil: GestaoFunilHandler;
  gestaoPanoramaLeads: GestaoPanoramaLeadsHandler;
  gestaoMetricas: GestaoMetricasHandler;
  gestaoRankings: GestaoRankingsHandler;
  gestaoTom: GestaoTomHandler;
  gestaoCompararAnos: GestaoCompararAnosHandler;
  gestaoCompararAnterior: GestaoCompararAnteriorHandler;
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
  gestaoEpocaExigeVendedora?: boolean;
  gestaoPorEmpresaDisponivel?: boolean;
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
    private readonly compararAnos: CompararAnosUseCase,
    private readonly compararAnterior: CompararPeriodoAnteriorUseCase,
    private readonly conexoes: ConexoesService,
    private readonly waha: WahaAdminClient,
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
    @Inject(CONVERSA_WHATSAPP_REPOSITORY)
    private readonly conversas: IConversaWhatsappRepository,
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
      gestaoEpocaExigeVendedora: !verLoja,
      gestaoPorEmpresaDisponivel: verLoja,

      /**
       * A AGENDA, DE UMA OU DA EQUIPE INTEIRA — 30/09/2026.
       *
       * ====================================================================
       * SEM NOME, A EQUIPE. E a mesma assimetria do `funil_de_atendimentos` e
       * do `panorama_de_leads`, e agora tambem aqui.
       *
       * Ate hoje a ferramenta so aceitava UMA vendedora. Em producao um
       * usuario pediu "a agenda de hoje da equipe toda" e ouviu "nao tenho
       * como puxar de uma vez, me passa os nomes" — a agente sendo honesta
       * com um contrato que era estreito demais.
       *
       * Fazer o modelo chamar oito vezes resolveria, mas amarraria a resposta
       * ao numero de voltas do laco: com equipe grande ele bateria o teto e a
       * resposta sairia pela metade. Uma chamada que ja traz todas nao tem
       * esse risco — e custa as mesmas consultas, sem as idas ao modelo.
       * ====================================================================
       *
       * O RECORTE DA GERENTE CONTINUA VALENDO: "equipe toda" e a equipe DELA.
       */
      gestaoAgenda: async ({ vendedora, periodo }) => {
        const linhasDe = async (id: string): Promise<string[]> => {
          const compromissos = await this.agenda.execute(id, periodo);
          return compromissos.map(
            (c) =>
              `${c.cliente} — ${formatarQuando(c.quando)}` +
              `${c.ocasiao ? ` (${c.ocasiao})` : ''}`,
          );
        };

        if (vendedora && vendedora.trim()) {
          return this.comVendedora(equipe, vendedora, linhasDe);
        }

        const ativas = (await this.vendedoras.listar({ ativo: true })).filter(
          (v) => !!v.id && (equipe === null || alcanca(v.id)),
        );

        const linhas: string[] = [];
        for (const v of ativas) {
          const dela = await linhasDe(v.id!);
          // QUEM NAO TEM NADA APARECE ASSIM MESMO. Omitir faria a lista
          // parecer a equipe inteira ocupada, e quem le nao teria como
          // distinguir "sem compromisso" de "nao foi consultada".
          linhas.push(
            dela.length === 0
              ? `${v.nome}: nada agendado.`
              : `${v.nome}: ${dela.join('; ')}`,
          );
        }
        return { status: 'OK' as const, linhas };
      },

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

      /**
       * A CARTEIRA PARADA, EM PAGINAS DE VINTE — 05/10/2026.
       *
       * A gestora pediu quem esta parado na carteira da Keyciane. Eram 97, a
       * ferramenta devolvia dez, e nao havia como chegar ao decimo primeiro:
       * a agente respondeu "nao consigo avancar por aqui", que era verdade e
       * nao servia. Lista de trabalho se trabalha inteira.
       *
       * O `aPartirDe` e quantos PULAR, e nao o numero da pagina: o modelo le
       * "ja te mandei 20 de 97" e pede os proximos com 20. Pedir pagina 2
       * obrigaria ele a saber o tamanho da pagina, que e detalhe nosso.
       */
      gestaoCarteira: async ({ vendedora, meses, aPartirDe }) => {
        // A carteira e por CODIGO DO ERP, e nao por id. Vendedora sem codigo
        // simplesmente nao tem carteira — o use case devolve vazio.
        let total = 0;
        let pulados = 0;
        const r = await this.comVendedora(equipe, vendedora, async (_id, codigoErp) => {
          // A data de corte vem pronta desde 01/10 — ver `dataDeCorte`.
          const pagina = await this.carteira.semComprar(
            codigoErp,
            dataDeCorte({ meses }),
            aPartirDe,
          );
          total = pagina.total;
          pulados = pagina.deslocamento ?? 0;
          return pagina.clientes.map((c) =>
            c.ultimaCompra
              ? `${c.nome} — última compra em ${c.ultimaCompra.toLocaleDateString('pt-BR')}, ${c.quantidade} ${c.quantidade === 1 ? 'compra' : 'compras'} no total`
              : `${c.nome} — nunca comprou`,
          );
        });
        return { ...r, total, aPartirDe: pulados };
      },

      /**
       * "Quem mais compra no Natal?" — da loja ou de uma vendedora.
       *
       * A MESMA GUARDA DO `gestaoItens`, pelo mesmo motivo: o schema ja pede
       * a vendedora quando falta `verLoja`, mas schema e PEDIDO — vale
       * enquanto ninguem mexer na lista de tools, e quem mexer nao vai lembrar
       * deste arquivo. Duas barreiras independentes para o mesmo erro, que e
       * silencioso: entregar a clientela da loja a quem nao pode ve-la nao
       * levanta excecao nenhuma.
       */
      /**
       * "Quais as compras da cliente 00376?", "as vendas do Marco em setembro",
       * "quais peças tinha a venda 1157?"
       *
       * PELO MENOS UM RECORTE FORTE — cliente, vendedora ou documento. Periodo
       * sozinho devolveria a loja inteira do mes, que e outra pergunta e tem
       * ferramenta propria.
       */
      gestaoVendasDetalhadas: async ({
        cliente,
        vendedora,
        documento,
        periodo,
        de,
        ate,
      }) => {
        const temRecorte = Boolean(
          cliente?.trim() || vendedora?.trim() || documento?.trim(),
        );
        if (!temRecorte) {
          return { status: 'EXIGE_RECORTE', linhas: [] };
        }

        // ---- a vendedora, se veio -------------------------------------
        let vendedoraId: string | null = null;
        if (vendedora?.trim()) {
          const r = await this.resolverVendedora.execute(vendedora);
          if (r.status === 'AMBIGUA') {
            return { status: 'AMBIGUA', sobre: 'vendedora', linhas: [], nomes: r.nomes };
          }
          if (r.status === 'NAO_ENCONTRADA') {
            return {
              status: 'NAO_ENCONTRADA',
              sobre: 'vendedora',
              linhas: [],
              nomes: r.sugestoes,
            };
          }
          // Fora da equipe responde como "nao achei" — dizer "voce nao pode ver
          // a Fulana" confirmaria que a Fulana existe.
          if (!alcanca(r.id)) {
            return { status: 'NAO_ENCONTRADA', sobre: 'vendedora', linhas: [] };
          }
          vendedoraId = r.id;
        }

        // ---- o cliente, se veio ---------------------------------------
        let clienteId: string | null = null;
        if (cliente?.trim()) {
          const termo = cliente.trim();
          // SO DIGITOS E CODIGO. "00376" e um cadastro; "Mariana" e um nome.
          const achados = /^\d+$/.test(termo)
            ? [await this.clientes.buscarPorCodigoErp(termo)].filter(
                (c): c is NonNullable<typeof c> => c !== null,
              )
            : await this.clientes.buscarPorNomeParcial(termo, 11);

          if (achados.length === 0) {
            return { status: 'NAO_ENCONTRADA', sobre: 'cliente', linhas: [] };
          }
          if (achados.length > 1) {
            // A LISTA, E NAO UMA ESCOLHA. Ha 17 clientes chamadas Mariana —
            // escolher a primeira responderia com confianca sobre a pessoa
            // errada.
            return {
              status: 'AMBIGUA',
              sobre: 'cliente',
              linhas: [],
              nomes: achados.map((c) => `${c.nome} (${c.codigoErp ?? 'sem código'})`),
            };
          }
          clienteId = achados[0].id ?? null;
        }

        const datas = datasDeRecorte(de, ate);
        const r = await this.consultarVendas.detalhadas(
          {
            clienteId,
            vendedoraId,
            documento,
            recorte: datas ? undefined : periodo,
            de: datas?.de,
            ate: datas?.ate,
          },
          MAXIMO_VENDAS_DETALHADAS,
        );

        return {
          status: 'OK' as const,
          linhas: r.vendas.map(linhaDaVenda),
          total: r.total,
        };
      },

      /**
       * "Qual a receita da MP Comercio?", "faturamento por empresa".
       *
       * A SEGUNDA BARREIRA: o schema so e oferecido a quem ve a loja, e aqui
       * se confere de novo. Schema e pedido, nao permissao.
       */
      gestaoPorEmpresa: async ({ periodo, de, ate }) => {
        if (!verLoja) {
          return { status: "INDISPONIVEL" as const, linhas: [] };
        }
        const datas = datasDeRecorte(de, ate);
        const linhas = await this.consultarVendas.porEmpresa(
          datas ? undefined : periodo,
          datas?.de,
          datas?.ate,
        );
        return { status: "OK" as const, linhas: linhas.map(linhaDaEmpresa) };
      },

      gestaoEpoca: async ({ vendedora, mes, dataComemorativa }) => {
        if (!verLoja && !vendedora?.trim()) {
          return { status: 'EXIGE_VENDEDORA', linhas: [] };
        }

        const recorte = {
          mes,
          dataComemorativa: dataComemorativa as NomeComemorativo | undefined,
        };

        if (vendedora?.trim()) {
          let total = 0;
          const r = await this.comVendedora(equipe, vendedora, async (_id, codigoErp) => {
            const pagina = await this.carteira.porEpoca(codigoErp, recorte);
            total = pagina.total;
            return pagina.clientes.map(linhaDaEpoca);
          });
          return { ...r, total };
        }

        const pagina = await this.carteira.porEpocaDaLoja(recorte);
        return {
          status: 'OK' as const,
          linhas: pagina.clientes.map(linhaDaEpoca),
          total: pagina.total,
        };
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
      gestaoProdutos: async ({ busca, incluirSemEstoque }) => {
        const achados = await this.listarProdutos.execute({
          busca,
          ativo: true,
          // Mesma regra do canal da vendedora, e pela mesma decisao de
          // 07/10: so o disponivel, salvo quando ela PEDE o indisponivel.
          apenasDisponiveis: !incluirSemEstoque,
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

        // AS PECAS ENTRAM NA LINHA — 02/10/2026. "Quem vendeu mais pecas em
        // setembro?" nao tinha resposta: a contagem de pecas so existia por
        // familia, uma de cada vez, e a gestora recebeu "infelizmente nao
        // tenho como somar o total de pecas por vendedora".
        //
        // SAO PERGUNTAS DIFERENTES, e a linha traz as tres: quem vende uma
        // alianca de R$ 200 mil lidera o faturamento e pode ser a ultima em
        // pecas.
        //
        // A PECA E A VENDIDA; O DINHEIRO E LIQUIDO — 02/10/2026. Reguas
        // diferentes de proposito: a receita tem de fechar com a tela de
        // Vendas, e a peca tem de fazer sentido para quem le. Enquanto a peca
        // tambem abatia, a Ylka saia como "2 vendas, 0 pecas". A devolucao nao
        // sumiu — vai no fim da linha, com o que voltou em peca e em dinheiro.
        const linhas = venderam.map(
          (r) =>
            `${r.nome}: ${r.quantidade} ${r.quantidade === 1 ? 'venda' : 'vendas'}, ${r.pecas} ${r.pecas === 1 ? 'peça' : 'peças'}${quebraPorTipo(r.familias)}, ${moeda(r.valor)}${devolucaoDaLinha(r)}`,
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
        // ================================================================
        // QUEM ESTA COM O CELULAR CONECTADO — 29/09/2026, pedido do Lucas.
        //
        // "Quantas vendedoras ativas temos, e elas estao conversando com
        // cliente?" era respondido pela metade: a lista dizia quem esta ativa
        // no CADASTRO e calava sobre quem o sistema de fato enxerga.
        //
        // A diferenca e enorme e invisivel. Em 29/09 havia UMA conexao de
        // vendedora em toda a operacao; sem esta linha, quem le conclui que o
        // sistema acompanha seis pessoas quando acompanha uma — e toda
        // metrica de atendimento parece quebrada em vez de vazia.
        //
        // UMA CHAMADA SO ao WAHA (`listarSessoes` devolve todas), e nao uma
        // por vendedora. E se o WAHA nao responder, a LISTA SAI MESMO ASSIM,
        // dizendo que nao deu para verificar: perder os nomes por causa do
        // status seria trocar o principal pelo acessorio.
        // ================================================================
        const conectadas = await this.waha
          .listarSessoes()
          .then(
            (sessoes) =>
              new Set(
                sessoes
                  .filter((s) => s.status === 'WORKING')
                  .map((s) => this.conexoes.vendedoraDaSessao(s.nome))
                  .filter((id): id is string => id !== null),
              ),
          )
          .catch(() => null);

        const linhas = ordenadas.map((v) => {
          const partes = [v.nome];
          if (v.statusDisponibilidade !== 'DISPONIVEL') {
            partes.push(DISPONIBILIDADE_LEGIVEL[v.statusDisponibilidade]);
          }
          if (conectadas !== null) {
            partes.push(
              v.id && conectadas.has(v.id)
                ? 'celular conectado'
                : 'celular NÃO conectado',
            );
          }
          if (v.especialidades.length > 0) {
            partes.push(v.especialidades.join(', '));
          }
          return partes.join(' — ');
        });

        // O RESUMO VEM ANTES DOS NOMES porque e ele que responde a pergunta.
        // Quem pede "quantas temos conectadas" quer o numero; a lista e o
        // detalhe para quem quiser conferir.
        if (conectadas === null) {
          linhas.unshift(
            'Não consegui verificar quais celulares estão conectados agora.',
          );
        } else {
          const n = ordenadas.filter((v) => v.id && conectadas.has(v.id)).length;
          linhas.unshift(
            n === 0
              ? `${ordenadas.length} ativa(s) no cadastro, e NENHUMA com o celular ` +
                  `conectado — o sistema não acompanha as conversas delas com cliente.`
              : `${ordenadas.length} ativa(s) no cadastro, ${n} com o celular conectado.`,
          );
        }

        return { linhas };
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
          // ================================================================
          // O DIA TEM DUAS FONTES, E A SEGUNDA ENTROU EM 29/09/2026.
          //
          // A linha do tempo so enxerga quem esta CADASTRADO como cliente —
          // um atendimento exige `cliente_id`. Entao "a Aline falou com
          // alguem hoje?" respondia NAO num dia em que ela trocou mensagem
          // com uma pessoa nova, que e justamente a conversa que mais
          // interessa: a que ainda pode virar cliente.
          //
          // O ponteiro nao tem esse buraco — ele registra toda conversa do
          // celular dela, cadastrada ou nao. Vai junto, e e dele que sai a
          // contagem de "com quantas pessoas ela falou".
          // ================================================================
          const { de, ate } = janelaDoDia(dia);
          const [pontos, conversas] = await Promise.all([
            this.linha.doDia(id, dia),
            this.conversas.entre(de, ate, id),
          ]);
          if (pontos.length === 0 && conversas.length === 0) return [];
          return resumoDoDia(pontos, await this.comNome(conversas));
        }),

      /**
       * QUEM ESTA CONVERSANDO AGORA — 29/09/2026, pedido do Lucas.
       *
       * ====================================================================
       * A UNICA LEITURA DA GESTAO QUE NAO ESPERA O LEITOR.
       *
       * Todas as outras — inclusive o `dia_da_vendedora` logo acima — leem a
       * linha do tempo, que so existe depois que o leitor roda, e o leitor
       * roda uma hora depois de a conversa PARAR. "A Aline esta com algum
       * cliente?" e uma pergunta sobre o presente sendo respondida por um
       * dado que e, por construcao, de uma hora atras.
       *
       * Em 29/09 o Lucas trocou mensagem com a vendedora as 15:08 e as 15:17
       * a Anastasia respondeu que nao havia registro nenhum. Estava correta e
       * era inutil: o ponteiro sabia da conversa desde as 15:08.
       * ====================================================================
       *
       * TRES COISAS QUE ELA NAO PODE DIZER, e as tres estao na forma da
       * resposta:
       *
       *   - NAO DIZ O ASSUNTO. Isto e ponteiro, nao texto.
       *   - NAO CHAMA DE CLIENTE quem o sistema ainda nao identificou. Sem o
       *     leitor, o numero desconhecido e indistinguivel entre a cliente
       *     nova e o entregador — e contar os dois juntos como "2 clientes"
       *     seria inventar com cara de numero.
       *   - NAO MOSTRA O TELEFONE. Quem pergunta isto nao vai ligar para
       *     ninguem; um numero de contato que nem se sabe se e cliente so
       *     serviria para ser repassado adiante. Mesma regra do aviso de lead.
       *
       * A conversa `IGNORADA` fica de fora no repositorio — ver o comentario
       * da porta. E privacidade: o WAHA le a conta inteira, e a familia da
       * vendedora nao e assunto da gestao.
       */
      gestaoConversasAgora: async ({ vendedora, minutos }) => {
        const janela =
          typeof minutos === 'number' && minutos >= 1 && minutos <= 1440
            ? Math.floor(minutos)
            : MINUTOS_CONVERSA_AGORA;
        const agora = Date.now();
        const desde = new Date(agora - janela * 60_000);

        const responder = async (
          vendedoraId: string | null,
        ): Promise<string[]> => {
          // COM NOME, o repositorio ja recorta. SEM nome, o recorte de equipe
          // e aplicado aqui — a gerente nao ve o celular de outro time.
          const vivas = (
            await this.conversas.entre(desde, new Date(agora), vendedoraId)
          ).filter((c) => vendedoraId !== null || alcanca(c.vendedoraId));

          if (vivas.length === 0) return [];

          // So no caso da loja inteira: com uma vendedora so, o nome dela ja
          // vem do `comVendedora` e repeti-lo em cada linha seria ruido.
          const nomes =
            vendedoraId === null
              ? new Map(
                  (await this.vendedoras.listar({}))
                    .filter((v): v is typeof v & { id: string } => !!v.id)
                    .map((v) => [v.id, v.nome] as [string, string]),
                )
              : null;

          const linhas = [
            `${vivas.length} conversa(s) com mensagem nos últimos ${janela} min.`,
          ];
          for (const c of await this.comNome(vivas)) {
            const ha = Math.max(
              0,
              Math.round((agora - c.ultimaMensagemEm.getTime()) / 60_000),
            );
            const dona = nomes
              ? `${nomes.get(c.vendedoraId) ?? 'vendedora fora do cadastro'}: `
              : '';
            linhas.push(
              `${dona}${c.cliente ?? 'número ainda NÃO identificado'} — última mensagem há ${ha} min`,
            );
          }
          return linhas;
        };

        return vendedora && vendedora.trim()
          ? this.comVendedora(equipe, vendedora, (id) => responder(id))
          : { status: 'OK' as const, linhas: await responder(null) };
      },

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

      /**
       * COMPARAR COM OUTROS ANOS — 29/09/2026.
       *
       * ====================================================================
       * OS DOIS NUMEROS VAO JUNTOS, E ESSA E A DECISAO.
       *
       * Com o mes correndo, a comparacao e cortada no mesmo dia em todos os
       * anos — senao o ano atual parece pior SEMPRE, e mais no comeco do mes.
       * Mas o mes FECHADO dos anos passados vai junto, porque "e quanto
       * fechou setembro passado?" e a pergunta seguinte, sempre.
       *
       * Conferido em 29/09: setembro/2024 ate o dia 29 deu R$ 511 mil, e o
       * mes fechou em R$ 847 mil — 66% de diferenca. Comparar mes parcial
       * com mes inteiro teria dito que 2026 caiu muito mais do que caiu.
       * ====================================================================
       */
      gestaoCompararAnos: async ({ mes, de, ate, vendedora }) => {
        const recorte = datasDeRecorte(de, ate);

        const comVendedora = async (
          fn: (id: string | null) => Promise<GestaoLeituraResultado>,
        ) => (vendedora && vendedora.trim()
          ? this.comVendedora(equipe, vendedora, async (id) => {
              const r = await fn(id);
              return r.status === 'OK' ? r.linhas : [];
            })
          : fn(null));

        return comVendedora(async (vendedoraId) => {
          const r =
            mes !== undefined && mes >= 1 && mes <= 12
              ? await this.compararAnos.porMes(mes, vendedoraId)
              : recorte
                ? await this.compararAnos.porPeriodo(recorte.de, recorte.ate, vendedoraId)
                : null;

          if (r === null) {
            // DATA DADA E NAO ENTENDIDA E DIFERENTE DE DATA NAO DADA.
            //
            // O `datasDeRecorte` devolve null em qualquer duvida — inclusive
            // quando a final vem antes da inicial, que e o caso do intervalo
            // que vira o ano. Sem esta distincao, quem pediu "15/12 a 15/01"
            // ouviria "me diga um recorte" depois de ter dito um, e tentaria
            // de novo do mesmo jeito.
            const tentou = Boolean(de || ate || mes !== undefined);
            return {
              status: 'OK' as const,
              linhas: [
                tentou
                  ? 'Não consegui usar esse recorte. Se for um intervalo que ' +
                    'atravessa a virada do ano (ex.: 15/12 a 15/01), ele ' +
                    'existiria em dois anos ao mesmo tempo e não dá para ' +
                    'comparar — peça um intervalo dentro do mesmo ano. ' +
                    'Para um mês, diga o mês.'
                  : 'Preciso saber QUAL recorte comparar: um mês (ex.: setembro) ' +
                    'ou um intervalo de datas. Pergunte.',
              ],
            };
          }

          if ('erro' in r) {
            return {
              status: 'OK' as const,
              linhas: [
                'Esse intervalo vira o ano (ex.: 15/12 a 15/01), e aí ele ' +
                  'existiria em dois anos ao mesmo tempo — não dá para comparar. ' +
                  'Peça um intervalo dentro do mesmo ano.',
              ],
            };
          }

          if (r.anos.length === 0) {
            return {
              status: 'OK' as const,
              linhas: [`Não há venda registrada em ${r.rotulo} em nenhum ano.`],
            };
          }

          const ordenados = [...r.anos].sort((a, b) => b.ano - a.ano);
          const linhas: string[] = [];

          if (r.cortadoNoDia !== null) {
            linhas.push(
              `Comparação de ${r.rotulo} até o dia ${r.cortadoNoDia} em todos os anos ` +
                `— ${ordenados[0].ano} ainda não fechou.`,
            );
          }

          ordenados.forEach((a, i) => {
            const anterior = ordenados[i + 1];
            const v = anterior ? variacao(a.receita, anterior.receita) : null;
            const delta = v === null ? '' : ` (${v > 0 ? '+' : ''}${v}% vs ${anterior.ano})`;
            const fechado =
              a.receitaFechada !== null
                ? `, mês fechado ${moeda(a.receitaFechada)}`
                : '';

            linhas.push(
              `${a.ano}: ${moeda(a.receita)} em ${a.quantidade} ` +
                `${a.quantidade === 1 ? 'venda' : 'vendas'}, ticket ${moeda(a.ticketMedio)}` +
                `${delta}${fechado}`,
            );
          });

          return { status: 'OK' as const, linhas };
        });
      },

      /**
       * ESTE PERIODO CONTRA O ANTERIOR — 29/09/2026, pedido do Lucas.
       *
       * ====================================================================
       * CLIENTES E VENDAS SAO NUMEROS DIFERENTES, E OS DOIS VAO NA RESPOSTA.
       *
       * A mesma cliente comprando tres vezes conta 1 cliente e 3 vendas. Ate
       * hoje so existia o segundo numero, e a Anastasia respondia "nao tenho
       * como contar quantos clientes diferentes compraram" — ela tinha, e
       * ninguem perguntava ao banco.
       *
       * Conferido em 29/09: 21 clientes em 22 vendas neste mes.
       * ====================================================================
       */
      gestaoCompararAnterior: async ({ periodo, de, ate, vendedora }) => {
        const recorte = datasDeRecorte(de, ate);

        const responder = async (vendedoraId: string | null) => {
          const c = recorte
            ? await this.compararAnterior.porDatas(recorte.de, recorte.ate, vendedoraId)
            : await this.compararAnterior.porRecorte(periodo ?? 'MES', vendedoraId);

          const linhas: string[] = [
            `${cap(c.rotulo)}: ${c.atual.clientes} cliente(s), ${c.atual.vendas} ` +
              `venda(s), ${moeda(c.atual.receita)} — ticket ${moeda(c.atual.ticketMedio)}`,
            `Período anterior: ${c.anterior.clientes} cliente(s), ${c.anterior.vendas} ` +
              `venda(s), ${moeda(c.anterior.receita)} — ticket ${moeda(c.anterior.ticketMedio)}`,
          ];

          const variacoes = [
            ['clientes', variacaoEntre(c.atual.clientes, c.anterior.clientes)],
            ['vendas', variacaoEntre(c.atual.vendas, c.anterior.vendas)],
            ['receita', variacaoEntre(c.atual.receita, c.anterior.receita)],
          ] as const;

          const ditas = variacoes
            .filter(([, v]) => v !== null)
            .map(([nome, v]) => `${(v as number) > 0 ? '+' : ''}${v}% em ${nome}`);

          linhas.push(
            ditas.length > 0
              ? ditas.join(' · ')
              : 'Não houve venda no período anterior, então não dá para calcular variação.',
          );

          // ================================================================
          // O FECHADO VAI JUNTO QUANDO HOUVE CORTE.
          //
          // Comparar mes parcial com mes inteiro faria o atual parecer pior
          // SEMPRE — no dia 2, 93% de queda aparente. Mas "o mes passado
          // inteiro deu quanto?" e a pergunta seguinte, e sem ela a
          // comparacao justa parece esconder o numero que a gestao conhece.
          // ================================================================
          if (c.anteriorFechado) {
            linhas.push(
              `Para referência, o período anterior FECHADO: ` +
                `${c.anteriorFechado.clientes} cliente(s), ${moeda(c.anteriorFechado.receita)}. ` +
                `A comparação acima corta os dois no mesmo ponto.`,
            );
          }

          return linhas;
        };

        return vendedora && vendedora.trim()
          ? this.comVendedora(equipe, vendedora, responder)
          : { status: 'OK' as const, linhas: await responder(null) };
      },

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
  /**
   * O ponteiro nao guarda nome — guarda `cliente_id`, ou nada.
   *
   * ======================================================================
   * `null` NO `cliente` E UM ESTADO, E NAO UMA FALHA DE BUSCA.
   *
   * Ele quer dizer "o sistema ainda nao sabe de quem e este numero", porque
   * quem sabe e o leitor e ele passa uma hora depois. Nao pode virar "sem
   * nome" nem sumir da contagem: a conversa existe, e e provavelmente a mais
   * interessante do dia — a pessoa nova.
   *
   * Cliente cadastrada mas sem nome preenchido e OUTRO caso, e por isso tem
   * texto proprio: ali o sistema sabe de quem e, e o cadastro e que esta
   * incompleto.
   * ======================================================================
   */
  private async comNome(
    conversas: ConversaEmAndamento[],
  ): Promise<ConversaComNome[]> {
    return Promise.all(
      conversas.map(async (c) => ({
        vendedoraId: c.vendedoraId,
        ultimaMensagemEm: c.ultimaMensagemEm,
        cliente: c.clienteId
          ? ((await this.clientes.buscarPorId(c.clienteId))?.nome ??
            'cliente sem nome no cadastro')
          : null,
      })),
    );
  }

  private async comVendedora(
    equipe: string[] | null,
    nome: string,
    consulta: (
      vendedoraId: string,
      codigoErp: string | null,
    ) => Promise<string[]>,
  ): Promise<GestaoLeituraResultado> {
    // ======================================================================
    // NOME AUSENTE NAO PODE VIRAR EXCECAO — 29/09/2026.
    //
    // O `vendedora` e `required` no schema, mas isso e um PEDIDO ao modelo e
    // nao uma garantia. Em 29/09 o Lucas perguntou "quantos clientes tivemos
    // em agosto?" — pergunta sobre a LOJA — e o modelo chamou a ferramenta da
    // VENDEDORA sem nome. O `resolverVendedora` estourou no `normalize` de
    // `undefined`, o `catch` de cima virou "Nao consegui consultar isso
    // agora", e a resposta nao ajudou ninguem: nem quem perguntou, nem quem
    // fosse investigar depois.
    //
    // `NAO_ENCONTRADA` com lista vazia faz o modelo perguntar de qual
    // vendedora se trata — ou perceber que a pergunta era da loja e escolher
    // outra ferramenta. Qualquer um dos dois e melhor que um erro.
    // ======================================================================
    if (typeof nome !== 'string' || nome.trim() === '') {
      return { status: 'NAO_ENCONTRADA', linhas: [], nomes: [] };
    }

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

/** Primeira maiúscula — os rótulos vêm em minúscula para caber no meio da frase. */
function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
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
export function resumoDoDia(
  pontos: PontoDaLinha[],
  conversas: ConversaComNome[] = [],
): string[] {
  const linhas: string[] = [];

  // ========================================================================
  // A CONTAGEM SAI DO PONTEIRO, E NAO DAS INTERACOES — 29/09/2026.
  //
  // A interacao so nasce quando o numero JA E cliente cadastrada; o ponteiro
  // registra toda conversa do celular. Como todo cliente cadastrado aparece
  // nos dois, trocar a fonte nao perde ninguem — so passa a incluir quem
  // ainda nao foi identificado, que antes sumia.
  //
  // Some numa contagem so, e depois separa. "Falou com 3" e a resposta da
  // pergunta; o detalhe de quem e quem vem atras, porque chamar de cliente
  // um numero que o sistema nao identificou seria inventar.
  // ========================================================================
  if (conversas.length > 0) {
    const identificadas = conversas
      .map((c) => c.cliente)
      .filter((n): n is string => n !== null);
    const anonimas = conversas.length - identificadas.length;

    const detalhe: string[] = [];
    if (identificadas.length > 0) {
      detalhe.push(`${identificadas.join(', ')}`);
    }
    if (anonimas > 0) {
      detalhe.push(
        `${anonimas} ${anonimas === 1 ? 'número ainda NÃO identificado' : 'números ainda NÃO identificados'}`,
      );
    }
    linhas.push(
      `Falou com ${conversas.length} ${conversas.length === 1 ? 'pessoa' : 'pessoas'} pelo WhatsApp: ` +
        `${detalhe.join(' e ')}.`,
    );
  }

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

/**
 * A linha de um cliente na pergunta de epoca.
 *
 * "EM N ANOS DIFERENTES" E A PARTE QUE IMPORTA: tres compras em tres
 * dezembros e habito; tres no mesmo dezembro e uma tarde de compras. Sem isso
 * a agente apresentaria as duas como a mesma coisa.
 *
 * A MESMA funcao serve a carteira e a loja — o texto nao pode mudar conforme
 * quem pergunta, senao a mesma pessoa aparece descrita de dois jeitos.
 */
function linhaDaEpoca(c: {
  nome: string;
  quantidade: number;
  anos: number;
  valorTotal: number;
  ultimaCompra: Date | null;
}): string {
  const compras = c.quantidade === 1 ? 'compra' : 'compras';
  const repeticao =
    c.anos > 1 ? ` em ${c.anos} anos diferentes` : ' (num ano só)';
  const ultima = c.ultimaCompra
    ? `, a última em ${c.ultimaCompra.toLocaleDateString('pt-BR')}`
    : '';
  return `${c.nome} — ${c.quantidade} ${compras}${repeticao}, ${moeda(c.valorTotal)}${ultima}`;
}

/**
 * Uma venda, com as pecas embaixo.
 *
 * AS PECAS NA MESMA RESPOSTA, e nao numa segunda pergunta: sao 1,6 por venda
 * na media, entao cabem — e "o que ela comprou" e sempre a pergunta seguinte.
 */
function linhaDaVenda(v: {
  documento: string | null;
  data: Date;
  cliente: string | null;
  clienteCodigo: string | null;
  vendedora: string | null;
  valor: number;
  status: string;
  itens: { quantidade: number; nome: string; valor: number }[];
}): string {
  const quem = v.cliente
    ? v.cliente + (v.clienteCodigo ? ` (${v.clienteCodigo})` : '')
    : null;
  const partes = [
    v.data.toLocaleDateString('pt-BR'),
    v.documento ? `doc ${v.documento}` : null,
    quem,
    v.vendedora,
    moeda(v.valor),
    v.status === 'devolvida' ? 'DEVOLVIDA' : null,
  ].filter(Boolean);

  // A QUANTIDADE E DECIMAL no banco (numeric(x,4)) porque peca a granel
  // existe. "1x" e o que se fala; "1.0000x" e o que o banco guarda.
  const pecas = v.itens
    .map(
      (i) =>
        `\n   • ${Number.isInteger(i.quantidade) ? i.quantidade : i.quantidade.toFixed(2)}x ${i.nome} — ${moeda(i.valor)}`,
    )
    .join('');
  return partes.join(' · ') + pecas;
}

/**
 * Uma empresa do grupo, com o que ela faturou.
 *
 * O TICKET SAI DA DIVISAO e nao vem do banco: receita liquida dividida por
 * vendas, igual ao resumo. Empresa sem venda no recorte nao divide por zero.
 */
function linhaDaEmpresa(e: {
  empresa: string;
  vendas: number;
  receita: number;
  devolucoes: number;
}): string {
  const ticket = e.vendas > 0 ? e.receita / e.vendas : 0;
  const unidade = e.vendas === 1 ? 'venda' : 'vendas';
  const devolvidas =
    e.devolucoes > 0
      ? `, ${e.devolucoes} ${e.devolucoes === 1 ? "devolução" : "devoluções"}`
      : '';
  return `${e.empresa}: ${moeda(e.receita)} em ${e.vendas} ${unidade} (ticket ${moeda(ticket)})${devolvidas}`;
}

/**
 * A QUEBRA POR TIPO na linha do panorama — 02/10/2026.
 *
 * "12 pecas" responde QUEM vendeu mais; "12 pecas (6 colares, 4 aneis, 2
 * solitarios)" responde O QUE ela vende. Era a leitura que a gestora estava
 * montando a mao, somando familia por familia.
 *
 * TETO DE QUATRO TIPOS, com o resto somado em "e mais N": a linha vai para o
 * WhatsApp, e uma vendedora com doze tipos viraria um paragrafo. Os quatro
 * primeiros ja dizem o perfil dela.
 *
 * A SOMA DOS TIPOS TEM DE DAR O NUMERO AO LADO, e isso nao e enfeite: foi
 * assim que a gestao achou o defeito de 02/10 — "6 vendas, 5 pecas" com
 * quatro tipos somando 6. Quem mexer aqui mantem isso verdadeiro.
 *
 * NAO EXISTE MAIS FAMILIA NEGATIVA. Ate 02/10 a quebra era liquida, e a
 * familia que so tinha devolucao vinha com sinal; o teto escondia justamente
 * ela, que continuava descontando no total. Hoje a venda e a devolucao vem
 * em listas separadas do banco, e o negativo deixou de ser representavel.
 */
const TETO_DE_TIPOS = 4;

function tiposDaLinha(
  familias: { familia: string; quantidade: number }[] | undefined,
): string[] {
  if (!familias?.length) return [];

  // O QUINTO APARECE QUANDO E O ULTIMO: esconder um tipo para escrever
  // "e mais 1" ocupa o mesmo espaco na linha e diz menos.
  const teto =
    familias.length === TETO_DE_TIPOS + 1 ? TETO_DE_TIPOS + 1 : TETO_DE_TIPOS;
  const partes = familias
    .slice(0, teto)
    .map((f) => pecas(f.quantidade, f.familia));
  const resto = familias.slice(teto).reduce((s, f) => s + f.quantidade, 0);
  if (resto > 0) {
    partes.push(`e mais ${resto}`);
  }
  return partes;
}

function quebraPorTipo(
  familias: { familia: string; quantidade: number }[] | undefined,
): string {
  // SEM QUEBRA, SEM PARENTESES. A quebra e um detalhe da linha; faltar nao pode
  // derrubar o panorama inteiro, que e a resposta.
  const partes = tiposDaLinha(familias);
  return partes.length ? ` (${partes.join(', ')})` : '';
}

/**
 * ", 2 devolvidas (2 pulseiras, R$ 110.460)" na linha da vendedora — 02/10.
 *
 * SO QUANDO HOUVE: em 236 das 268 linhas (vendedora x mes) da base nao ha
 * devolucao nenhuma, e ali a linha sai exatamente como era.
 *
 * O VALOR ENTRA AQUI porque ele JA SAIU do numero principal. A Ylka aparece
 * com R$ 33.590 em agosto tendo vendido R$ 144.050: sem este pedaco, 77% do
 * mes dela e invisivel e a leitura vira "vendeu pouco" em vez de "teve
 * devolucao" — que e outra conversa inteiramente.
 */
function devolucaoDaLinha(r: {
  devolvidas: number;
  valorDevolvido: number;
  familiasDevolvidas?: { familia: string; quantidade: number }[];
}): string {
  if (!r.devolvidas) return '';
  const dentro = [
    ...tiposDaLinha(r.familiasDevolvidas),
    moeda(r.valorDevolvido),
  ];
  const unidade = r.devolvidas === 1 ? 'devolvida' : 'devolvidas';
  return `, ${r.devolvidas} ${unidade} (${dentro.join(', ')})`;
}
