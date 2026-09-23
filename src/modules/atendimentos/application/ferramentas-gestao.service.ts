import { Inject, Injectable } from '@nestjs/common';
import { diasDeCalendario } from '../../../shared/tempo/dias-de-calendario';
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
  GestaoPanoramaLeadsHandler,
  GestaoLeituraResultado,
  GestaoMetasHandler,
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
import { ConsultarAgendaVendedoraUseCase } from './use-cases/consultar-agenda-vendedora.use-case';
import { ConsultarCarteiraVendedoraUseCase } from './use-cases/consultar-carteira-vendedora.use-case';
import { ConsultarDesempenhoVendedoraUseCase } from './use-cases/consultar-desempenho-vendedora.use-case';
import { ResolverVendedoraPorNomeUseCase } from './use-cases/resolver-vendedora-por-nome.use-case';
import { ConsultarAuditoriaUseCase } from './use-cases/consultar-auditoria.use-case';
import { ConsultarLinhaDoTempoUseCase } from './use-cases/consultar-linha-do-tempo.use-case';
import type { PontoDaLinha } from '../domain/ports/repositories/atendimento-repository.port';
import { EncaminharLeadUseCase } from './use-cases/encaminhar-lead.use-case';
import { fraseDoFunil, rotuloEtapa } from './etapas-em-palavras';
import {
  estadoLegivel,
  linhaDoLead,
} from '../../leads/application/leads-em-lista';

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

/** Janela padrao quando nao dizem "hoje" nem "esta semana". */
const DIAS_PADRAO_FEEDBACK = 7;

/** O conjunto de handlers da gestao, pronto para entrar no `chatComFerramentas`. */
export interface FerramentasGestao {
  gestaoAgenda: GestaoAgendaHandler;
  gestaoVendas: GestaoVendasHandler;
  gestaoMetas: GestaoMetasHandler;
  gestaoPanorama: GestaoPanoramaHandler;
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
   * @param solicitante nome de quem esta do outro lado. Entra apenas no AVISO
   *   que a vendedora recebe — "A Fernanda agendou o cliente..." —, para ela
   *   saber de quem veio o compromisso. Nao muda o que a ferramenta pode ver:
   *   o escopo da gestao ja e o mesmo para toda a administracao.
   */
  montar(solicitante?: string | null): FerramentasGestao {
    return {
      gestaoAgenda: async ({ vendedora, periodo }) =>
        this.comVendedora(vendedora, async (id) => {
          const compromissos = await this.agenda.execute(id, periodo);
          return compromissos.map(
            (c) =>
              `${c.cliente} — ${formatarQuando(c.quando)}` +
              `${c.ocasiao ? ` (${c.ocasiao})` : ''}`,
          );
        }),

      gestaoVendas: async ({ vendedora, periodo }) =>
        this.comVendedora(vendedora, async (id) => {
          const v = await this.desempenho.vendas(id, periodo);
          if (v.quantidade === 0) return [];
          return [
            `${v.quantidade} ${v.quantidade === 1 ? 'venda' : 'vendas'}, ` +
              `${moeda(v.receita)} em receita, ticket médio ${moeda(v.ticketMedio)}`,
          ];
        }),

      gestaoMetas: async ({ vendedora }) =>
        this.comVendedora(vendedora, async (id) => {
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
        const r = await this.comVendedora(vendedora, async (_id, codigoErp) => {
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
        const r = await this.comVendedora(vendedora, async (_id, codigoErp) => {
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

      gestaoPanorama: async ({ periodo }) => {
        const ativas = await this.vendedoras.listar({ ativo: true });
        const linhas: { texto: string; receita: number }[] = [];
        for (const v of ativas) {
          if (!v.id) continue;
          const r = await this.desempenho.vendas(v.id, periodo);
          // Quem nao vendeu entra tambem: "quem esta atras" e uma pergunta
          // legitima, e omitir o zero esconderia exatamente a resposta.
          linhas.push({
            texto:
              r.quantidade === 0
                ? `${v.nome}: nenhuma venda`
                : `${v.nome}: ${r.quantidade} ${r.quantidade === 1 ? 'venda' : 'vendas'}, ${moeda(r.receita)}`,
            receita: r.receita,
          });
        }
        linhas.sort((a, b) => b.receita - a.receita);
        return { linhas: linhas.map((l) => l.texto) };
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
        const r = await this.comVendedora(vendedora, async (id) => {
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
        const ativas = await this.vendedoras.listar({ ativo: true });
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
        this.comVendedora(vendedora, async (id) => {
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
      gestaoPanoramaLeads: async ({ vendedora }) => {
        if (vendedora && vendedora.trim()) {
          return this.comVendedora(vendedora, async (_id, codigoErp) => {
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
          return this.comVendedora(vendedora, async (id) => {
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

        // A LOJA. Uma linha do todo, e depois uma por vendedora — e a leitura
        // que a gestao faz: primeiro o tamanho, depois de quem e.
        const r = await this.auditoria.resumo({ apenasAbertos: true });
        if (r.total === 0) return { status: 'OK', linhas: [] };

        const linhas = [`A loja tem ${fraseDoFunil(r.total, r.porEtapa)}.`];
        const esperando = r.vendedoras.reduce(
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
        for (const v of [...r.vendedoras].sort((a, b) => b.total - a.total)) {
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
   * Resolve o nome e so entao consulta.
   *
   * Um lugar so faz a resolucao para as tres leituras, entao as tres se
   * comportam igual — inclusive na ambiguidade, que e onde um palpite sairia
   * caro: dar o numero da vendedora errada e um erro que ninguem percebe na
   * hora.
   */
  private async comVendedora(
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

export function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
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
