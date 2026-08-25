import { Inject, Injectable } from '@nestjs/common';
import type {
  GestaoCarteiraHandler,
  GestaoMelhoresHandler,
  GestaoAgendarHandler,
  GestaoCarteiraDoClienteHandler,
  GestaoFeedbacksHandler,
  GestaoLeituraResultado,
  GestaoMetasHandler,
  GestaoPanoramaHandler,
  GestaoVendasHandler,
  GestaoAgendaHandler,
} from '../../agentes/domain/ports/llm-client.port';
import { CLIENTE_REPOSITORY } from '../../clientes/domain/ports/injection-tokens';
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

const MAXIMO_CLIENTES_HOMONIMOS = 5;
/** Feedbacks por resposta. Acima disso a mensagem deixa de ser lida. */
const MAXIMO_FEEDBACKS = 10;
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
  gestaoCarteira: GestaoCarteiraHandler;
  gestaoMelhores: GestaoMelhoresHandler;
  gestaoFeedbacks: GestaoFeedbacksHandler;
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
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
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
                d.clienteNome + ' — ' + rotuloEtapa(d.etapa) + ', sem feedback registrado ainda',
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
                (i.aguardandoRelato ? ' (cobranca enviada, aguardando resposta)' : ''),
          );
        });
        return { ...r, total };
      },

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
            dono = v ? `carteira de ${v.nome}` : `vendedora ${codigo} (não cadastrada)`;
          }
          linhas.push(
            `${c.nome}${c.codigoErp ? ` (código ${c.codigoErp})` : ''} — ${dono}`,
          );
        }

        return { status: achados.length > 1 ? 'AMBIGUO' : 'OK', linhas };
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
    consulta: (vendedoraId: string, codigoErp: string | null) => Promise<string[]>,
  ): Promise<GestaoLeituraResultado> {
    const r = await this.resolverVendedora.execute(nome);
    if (r.status === 'AMBIGUA') return { status: 'AMBIGUA', linhas: [], nomes: r.nomes };
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

/** A etapa em portugues de gente, para caber na frase da agente. */
function rotuloEtapa(etapa: string): string {
  const mapa: Record<string, string> = {
    PRIMEIRO_CONTATO: 'primeiro contato',
    EM_NEGOCIACAO: 'em negociacao',
    REMARCADO: 'remarcado',
    SEM_CONTATO: 'nao conseguiu falar',
    CONCLUIDO: 'concluido',
    NAO_AVANCOU: 'nao avancou',
  };
  return mapa[etapa] ?? etapa.toLowerCase();
}
