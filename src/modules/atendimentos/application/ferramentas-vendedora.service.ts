import { Inject, Injectable } from '@nestjs/common';
import type {
  AgendarContatoHandler,
  AtualizarLeadHandler,
  ClientesSemComprarHandler,
  ConsultarAgendaHandler,
  ConsultarMetasHandler,
  ConsultarProdutosHandler,
  ConsultarCarteiraAgoraHandler,
  ConsultarMeusLeadsHandler,
  ConsultarVendasHandler,
  MelhoresClientesHandler,
  RegistrarRelatoHandler,
} from '../../agentes/domain/ports/llm-client.port';
import { AgendarContatoVendedoraUseCase } from './use-cases/agendar-contato-vendedora.use-case';
import { ConsultarAgendaVendedoraUseCase } from './use-cases/consultar-agenda-vendedora.use-case';
import { ConsultarCarteiraVendedoraUseCase } from './use-cases/consultar-carteira-vendedora.use-case';
import { ConsultarDesempenhoVendedoraUseCase } from './use-cases/consultar-desempenho-vendedora.use-case';
import { ConsultarProdutosVendedoraUseCase } from './use-cases/consultar-produtos-vendedora.use-case';
import { ProcessarRelatoVendedoraUseCase } from './use-cases/processar-relato-vendedora.use-case';
import { ConsultarAuditoriaUseCase } from './use-cases/consultar-auditoria.use-case';
import { LEAD_REPOSITORY } from '../../leads/domain/ports/injection-tokens';
import type {
  ILeadRepository,
  Lead,
  StatusLeadVendedora,
} from '../../leads/domain/ports/repositories/lead-repository.port';
import {
  AtualizarStatusLeadUseCase,
  type VinculoDoLead,
} from '../../leads/application/use-cases/atualizar-status-lead.use-case';
import { linhaDoLead } from '../../leads/application/leads-em-lista';
import { linhasDoFunil } from './etapas-em-palavras';
import { formatarQuando } from './ferramentas-gestao.service';

/**
 * Dinheiro COM CENTAVOS — e a diferenca para o `moeda` da gestao, que arredonda
 * para inteiro.
 *
 * Nao e detalhe de estilo. A gestao le agregado ("R$ 34 mil na semana"), onde o
 * centavo e ruido. A vendedora le PRECO DE PECA, e ali o centavo e o numero que
 * ela vai falar para o cliente. Reusar o formatador da gestao aqui transformou
 * "R$ 7.490,37" em "R$ 7.490" — pego pelo teste do catalogo em 21/08, na
 * refatoracao que juntou as ferramentas num servico.
 */
function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/** Handlers do canal da vendedora, prontos para o `chatComFerramentas`. */
export interface FerramentasVendedora {
  consultarAgenda: ConsultarAgendaHandler;
  consultarVendas: ConsultarVendasHandler;
  consultarMetas: ConsultarMetasHandler;
  consultarProdutos: ConsultarProdutosHandler;
  consultarCarteiraAgora: ConsultarCarteiraAgoraHandler;
  consultarMeusLeads: ConsultarMeusLeadsHandler;
  /** A UNICA escrita dela sobre lead — dar baixa, ou dizer que virou cliente. */
  atualizarLead: AtualizarLeadHandler;
  clientesSemComprar: ClientesSemComprarHandler;
  melhoresClientes: MelhoresClientesHandler;
  agendarContato: AgendarContatoHandler;
  /** So existe quando ha mensagem original para extrair — ver `montar`. */
  registrarRelato?: RegistrarRelatoHandler;
}

/** Quem esta falando, e a mensagem dela quando ha relato a extrair. */
export interface ContextoVendedora {
  vendedoraId: string;
  codigoErp: string | null;
  /**
   * A frase ORIGINAL dela, para o extrator de relato.
   *
   * Ausente no painel: relato e coisa de WhatsApp, onde ela responde a uma
   * cobranca. Sem isso, a ferramenta simplesmente nao e oferecida — e o modelo
   * nao tenta registrar relato de uma conversa de tela.
   */
  textoOriginal?: string;
  /** Chamado quando um relato foi mesmo gravado, para quem chama saber. */
  aoRegistrarRelato?: () => void;
}

/**
 * As ferramentas da VENDEDORA, num lugar so — o mesmo motivo do
 * `FerramentasGestaoService`: duas copias divergem, e a divergencia aparece
 * como a mesma pergunta com resposta diferente conforme a porta.
 *
 * ==========================================================================
 * O ESCOPO CONTINUA SENDO AUSENCIA DE CAMINHO.
 *
 * O `vendedoraId` e o `codigoErp` entram por CLOSURE, do contexto passado por
 * quem chama — no WhatsApp vem do telefone resolvido, no painel vem do login.
 * NENHUM handler aceita "de quem" como parametro.
 *
 * E por isso que estas ferramentas sao SEPARADAS das da gestao, e nao as
 * mesmas com um campo opcional: se `consultarAgenda` aceitasse um `vendedora?`,
 * bastaria o modelo preencher esse campo para o escopo cair inteiro.
 * ==========================================================================
 */
/** Leads por resposta. Acima disso a mensagem deixa de ser lida no celular. */
const MAX_LEADS = 10;

/** O status como ela ouve de volta — nunca a constante em caixa alta. */
const EM_PALAVRAS: Record<StatusLeadVendedora, string> = {
  NOVO: 'novo, ainda sem contato',
  EM_CONTATO: 'em contato',
  VIROU_CLIENTE: 'virou cliente',
  NAO_VINGOU: 'não vingou',
};

/**
 * O QUE ACONTECEU COM A PONTE PARA O CADASTRO — e o que nao pode ser omitido.
 *
 * ==========================================================================
 * "ELA DISSE" E "O SISTEMA ACHOU" SAO DOIS FATOS DIFERENTES.
 *
 * `clientes` e espelho do ERP e a sincronizacao demora. Marcar VIROU_CLIENTE
 * hoje e nao achar o cadastro e o caso COMUM, e nao um erro — mas uma
 * resposta que so diz "pronto, virou cliente" faria a vendedora acreditar num
 * vinculo que nao existe, e ninguem descobriria.
 *
 * E a licao do "ja anotei" do ATwpp: o que a ferramenta nao conseguiu fazer
 * tem de aparecer na frase, e nao so no log.
 * ==========================================================================
 */
function rodapeDoVinculo(vinculo: VinculoDoLead, nome: string): string {
  if (vinculo === 'ENCONTRADO') {
    return ` O cadastro de ${nome} foi encontrado no sistema e ficou ligado ao lead.`;
  }
  if (vinculo === 'NAO_ENCONTRADO') {
    return (
      ` ATENÇÃO, e diga isto: ainda NÃO existe cadastro de cliente com o telefone de ${nome}, ` +
      'então a anotação ficou guardada mas o lead não está ligado a nenhum cadastro. ' +
      'Quando o cadastro aparecer no sistema, a ligação pode ser feita. NÃO diga que já está ligado.'
    );
  }
  return '';
}

/**
 * Teto da BUSCA por nome, que e outra coisa do teto da LISTA.
 *
 * A lista tem teto porque a mensagem precisa caber no celular. A busca tem
 * teto so para nao varrer o historico inteiro de quem trabalha ha anos — e ela
 * olha os fechados tambem, por isso o numero e mais folgado. Achar o lead
 * errado por ele ter ficado de fora do corte seria pior que a consulta custar
 * um pouco mais.
 */
const MAX_BUSCA_LEAD = 100;

/** Sem acento, sem caixa, sem espaco sobrando — para comparar nome digitado. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

@Injectable()
export class FerramentasVendedoraService {
  constructor(
    private readonly agenda: ConsultarAgendaVendedoraUseCase,
    private readonly desempenho: ConsultarDesempenhoVendedoraUseCase,
    private readonly produtos: ConsultarProdutosVendedoraUseCase,
    private readonly carteira: ConsultarCarteiraVendedoraUseCase,
    private readonly agendarContato: AgendarContatoVendedoraUseCase,
    private readonly relato: ProcessarRelatoVendedoraUseCase,
    private readonly auditoria: ConsultarAuditoriaUseCase,
    @Inject(LEAD_REPOSITORY)
    private readonly leads: ILeadRepository,
    private readonly atualizarStatusLead: AtualizarStatusLeadUseCase,
  ) {}

  /**
   * O nome bate com algum lead encaminhado para ela?
   *
   * Comparacao FROUXA de proposito — ela escreve "Aslan" e o lead pode estar
   * gravado como "Aslan Ferreira". Um conter o outro ja basta: a lista de leads
   * dela e curta, e o preco de um falso positivo aqui e uma frase a mais, nunca
   * o dado de outra pessoa.
   *
   * OLHA O HISTORICO INTEIRO (`apenasAbertos: false`), e nao so a fila. Duas
   * razoes: para AGENDAR, o motivo da recusa vale mesmo para um lead ja
   * resolvido; e para ATUALIZAR, ela precisa poder reabrir um que deu baixa
   * por engano. A fila fechada seria uma porta so de saida.
   */
  private async leadChamado(
    codigoErp: string,
    nome: string,
  ): Promise<Lead | null> {
    const procurado = normalizar(nome);
    if (procurado.length < 3) return null;

    const leads = await this.leads.listarPorVendedora(
      codigoErp,
      MAX_BUSCA_LEAD,
      false,
    );
    return (
      leads.find((l) => {
        const dele = normalizar(l.nome ?? '');
        return (
          dele.length >= 3 &&
          (dele.includes(procurado) || procurado.includes(dele))
        );
      }) ?? null
    );
  }

  montar(ctx: ContextoVendedora): FerramentasVendedora {
    const { vendedoraId, codigoErp } = ctx;

    const ferramentas: FerramentasVendedora = {
      consultarAgenda: async ({ periodo }) => {
        const compromissos = await this.agenda.execute(vendedoraId, periodo);
        return {
          compromissos: compromissos.map((c) => ({
            cliente: c.cliente,
            quando: formatarQuando(c.quando),
            ocasiao: c.ocasiao ?? undefined,
          })),
        };
      },

      /**
       * "Como esta minha carteira" — 21/09/2026.
       *
       * O RECORTE E "AGORA", E NAO UM DIA. A etapa sai da view e e sempre o
       * estado atual; perguntar por dia obrigaria a dizer "dos 8 abertos na
       * segunda, 3 estao concluidos hoje", que e verdade e ninguem entende
       * numa mensagem. "O que esta comigo agora" e a pergunta que o dado
       * responde sem nota de rodape.
       *
       * O `vendedoraId` vai no FILTRO, e nao numa escolha depois: o SQL ja
       * volta so com a linha dela. Nao existe caminho por onde a carteira de
       * outra pessoa chegue ate aqui.
       */
      /**
       * "Quais leads me mandaram" — 21/09/2026.
       *
       * ====================================================================
       * ANTES DISSO, O LEAD SO EXISTIA NA MENSAGEM QUE ELA RECEBEU.
       *
       * Encaminhar nao cria atendimento (decisao de 03/09), entao a Elena nao
       * tinha onde ver o que chegou: o nome, o que a pessoa procura e o
       * telefone viviam numa unica mensagem de WhatsApp. O Lucas levantou o
       * caso em 21/09 — apagar a conversa, trocar de aparelho ou perder o
       * numero significava perder o lead, e no banco ele consta encaminhado.
       *
       * O FILTRO E O CODIGO DELA, por closure. Nao existe parametro de "de
       * quem": nenhuma frase alcanca o lead de uma colega.
       * ====================================================================
       */
      consultarMeusLeads: async () => {
        // SEM CODIGO NAO HA FILTRO, e lista vazia mentiria dizendo "nao tem
        // lead" quando a verdade e "nao da para saber". Ver a migracao 55.
        if (!codigoErp) return { status: 'SEM_CODIGO', linhas: [], total: 0 };

        // SO O QUE AINDA ESTA COM ELA (o padrao de `listarPorVendedora`).
        // Antes da migracao 60 vinha tudo o que ela ja tinha recebido desde
        // sempre, e o teto de 10 escondia isso por acidente — ver a migracao.
        const achados = await this.leads.listarPorVendedora(
          codigoErp,
          MAX_LEADS + 1,
        );
        const mostrar = achados.slice(0, MAX_LEADS);
        return {
          status: 'OK',
          linhas: mostrar.map((l) => linhaDoLead(l, true)),
          total: achados.length,
        };
      },

      /**
       * A BAIXA NO LEAD — 22/09/2026. A unica ESCRITA dela sobre lead.
       *
       * ====================================================================
       * A FRASE E MONTADA AQUI, NO SERVIDOR, e com o VEREDITO NA FRENTE.
       *
       * Mesma regra do `agendarContato`, e pelo mesmo motivo historico: o
       * modelo ja anunciou sucesso por cima de um tool_result que dizia o
       * contrario. Comecar por "Anotei" ou "NAO ANOTEI" nao deixa espaco.
       *
       * E O CASO DELICADO E O VINCULO: quando ela diz que o lead comprou e o
       * cadastro ainda nao existe no ERP, a mensagem PRECISA dizer isso. Um
       * "pronto, virou cliente" ali seria a mentira educada do ATwpp de novo.
       * ====================================================================
       */
      atualizarLead: async ({ lead, status, observacao }) => {
        if (!codigoErp) {
          return {
            status: 'SEM_CODIGO',
            mensagem:
              'NÃO ANOTEI. O cadastro dela está sem código de vendedora, então não dá ' +
              'para saber quais leads são dela. Diga isso e peça para ela falar com a gestão.',
          };
        }

        const achado = await this.leadChamado(codigoErp, lead);
        if (!achado) {
          return {
            status: 'NAO_ACHEI',
            mensagem:
              'NÃO ANOTEI. Não encontrei esse lead entre os que foram encaminhados para ela. ' +
              'Peça o nome como está na lista, sem sugerir que ele exista em outro lugar.',
          };
        }

        const r = await this.atualizarStatusLead.execute({
          leadId: achado.id,
          vendedoraCodigo: codigoErp,
          status,
          observacao,
        });

        // NAO_E_DELA e NAO_ENCONTRADO viram a MESMA frase de nome errado: o
        // `leadChamado` ja so procura entre os dela, entao chegar aqui e
        // corrida entre requisicoes — e dizer "esse é de outra" entregaria que
        // ele existe. Mesma regra do resto do canal dela.
        if (r.status !== 'ATUALIZADO') {
          return {
            status: 'NAO_ACHEI',
            mensagem:
              'NÃO ANOTEI. Não encontrei esse lead entre os que foram encaminhados para ela.',
          };
        }

        const nome = r.lead.nome ?? 'o lead';
        return {
          status: 'ATUALIZADO',
          mensagem: `Anotei: ${nome} agora está como "${EM_PALAVRAS[status]}".${
            observacao ? ' A observação dela foi guardada junto.' : ''
          }${rodapeDoVinculo(r.vinculo, nome)}`,
        };
      },

      consultarCarteiraAgora: async () => {
        const r = await this.auditoria.resumo({
          apenasAbertos: true,
          vendedoraId,
        });
        const minha = r.vendedoras[0];
        if (!minha) return { total: 0, linhas: [], aguardandoRelato: 0 };
        return {
          total: minha.total,
          linhas: linhasDoFunil(minha.porEtapa),
          aguardandoRelato: minha.aguardandoRelato,
        };
      },

      consultarVendas: async ({ periodo }) => {
        const v = await this.desempenho.vendas(vendedoraId, periodo);
        if (v.quantidade === 0) {
          return { resumo: 'nenhuma venda concluída nesse período' };
        }
        return {
          resumo:
            `${v.quantidade} ${v.quantidade === 1 ? 'venda' : 'vendas'}, ` +
            `${moeda(v.receita)} em receita, ticket médio ${moeda(v.ticketMedio)}`,
        };
      },

      consultarMetas: async () => {
        const metas = await this.desempenho.metas(vendedoraId);
        return {
          metas: metas.map((m) => ({
            linha: m.batida
              ? `${m.descricao}: alvo ${moeda(m.alvo)}, já batida — realizado ${moeda(m.realizado)} (${m.percentual}%)`
              : `${m.descricao}: alvo ${moeda(m.alvo)}, realizado ${moeda(m.realizado)} (${m.percentual}%), faltam ${moeda(m.restante)} até ${m.prazo.toLocaleDateString('pt-BR')}`,
          })),
        };
      },

      consultarProdutos: async ({ busca }) => {
        const achados = await this.produtos.execute(busca);
        return {
          produtos: achados.map((p) => ({
            // DISPONIVEL, E NAO QUANTOS — 25/09/2026. Ver
            // `ProdutoParaVendedora`: o numero nao chega ate aqui.
            linha:
              `${p.descricao} (${p.categoria} / ${p.familia})` +
              `${p.codigo ? ` — código ${p.codigo}` : ''}: ` +
              `${p.disponivel ? 'disponível' : 'indisponível'}, ` +
              `${moeda(p.precoVenda)}`,
          })),
        };
      },

      clientesSemComprar: async ({ meses }) => {
        const { clientes, total } = await this.carteira.semComprar(codigoErp, meses);
        return {
          clientes: clientes.map((c) => ({
            linha: c.ultimaCompra
              ? `${c.nome} — última compra em ${c.ultimaCompra.toLocaleDateString('pt-BR')}, ${c.quantidade} ${c.quantidade === 1 ? 'compra' : 'compras'} no total`
              : `${c.nome} — nunca comprou`,
          })),
          total,
        };
      },

      melhoresClientes: async ({ categoria, ultimosMeses }) => {
        const { clientes, total } = await this.carteira.maioresCompradores(codigoErp, {
          categoria,
          ultimosMeses,
        });
        const unidade = categoria ? 'peça' : 'compra';
        return {
          clientes: clientes.map((c) => ({
            linha: `${c.nome} — ${c.quantidade} ${c.quantidade === 1 ? unidade : unidade + 's'}, ${moeda(c.valorTotal)}`,
          })),
          total,
        };
      },

      agendarContato: async ({ cliente, quandoIso }) => {
        const r = await this.agendarContato.execute(
          vendedoraId,
          codigoErp,
          cliente,
          quandoIso,
        );

        // A frase de volta e montada AQUI, no servidor, e nao pelo modelo: ela
        // carrega nome e horario, que sao exatamente o que ele inventaria.
        switch (r.status) {
          case 'AGENDADO':
            return {
              status: r.status,
              mensagem: `Marcado: contato com ${r.cliente} em ${formatarQuando(r.quando)}. Te lembro perto da hora.`,
            };
          case 'CLIENTE_AMBIGUO':
            return {
              status: r.status,
              mensagem: `Tem mais de um cliente com esse nome na carteira dela: ${r.nomes.join(', ')}. Pergunte qual e antes de marcar.`,
            };
          case 'HORARIO_INVALIDO':
            return {
              status: r.status,
              mensagem:
                'O horário não serve — precisa ser no futuro e dentro dos próximos seis meses. Peça o horário de novo.',
            };
          case 'ATENDIMENTO_DE_OUTRA_PESSOA':
            return {
              status: r.status,
              mensagem: `${r.cliente} já tem um atendimento em andamento que não é dela. Diga que a administração precisa resolver isso antes.`,
            };
          default: {
            // ================================================================
            // ANTES DE DIZER "NAO ACHEI", VER SE E UM LEAD DELA.
            //
            // Em 22/09/2026 a Elena ofereceu agendar um lead, o Lucas aceitou,
            // e ela respondeu "com qual cliente?" — porque agendar exige
            // cliente, e lead nao e cliente (atendimentos.cliente_id e NOT
            // NULL). A oferta foi barrada no prompt no mesmo dia, mas prompt e
            // barreira mole: ESTE ramo e o que garante a resposta certa mesmo
            // quando o modelo tenta assim mesmo.
            //
            // So os leads DELA, pelo mesmo caminho da ferramenta de listar —
            // sem codigo de vendedora nao ha o que consultar.
            // ================================================================
            const lead = codigoErp
              ? await this.leadChamado(codigoErp, cliente)
              : null;
            if (lead) {
              return {
                status: 'E_LEAD',
                mensagem:
                  `${lead.nome ?? 'Esse contato'} é um LEAD, e ainda não tem cadastro de cliente — por isso não entra na agenda. ` +
                  'Diga isso com clareza, e ofereça o que existe: ela pode falar com a pessoa pelo telefone ' +
                  'que está na lista de leads, e pode anotar como ficou usando "atualizar_lead". ' +
                  'NÃO prometa marcar, nem diga que marcou.',
              };
            }
            return {
              status: r.status,
              mensagem:
                'Não encontrei esse cliente na carteira dela. Diga isso, sem sugerir que ele exista em outro lugar.',
            };
          }
        }
      },
    };

    // Relato SO com a frase original em maos. No painel ela nao existe, e a
    // ferramenta nem e oferecida — ver ContextoVendedora.textoOriginal.
    if (ctx.textoOriginal !== undefined) {
      const original = ctx.textoOriginal;
      ferramentas.registrarRelato = async () => {
        // O texto ORIGINAL, nao o que o modelo entendeu: o relato guardado tem
        // que ser a frase dela.
        const r = await this.relato.execute(vendedoraId, original);
        if (r.status === 'REGISTRADO') ctx.aoRegistrarRelato?.();
        return {
          status: r.status,
          mensagem: r.status === 'REGISTRADO' ? r.resposta : '',
        };
      };
    }

    return ferramentas;
  }
}
