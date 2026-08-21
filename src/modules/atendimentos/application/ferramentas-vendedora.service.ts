import { Injectable } from '@nestjs/common';
import type {
  AgendarContatoHandler,
  ClientesSemComprarHandler,
  ConsultarAgendaHandler,
  ConsultarMetasHandler,
  ConsultarProdutosHandler,
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
@Injectable()
export class FerramentasVendedoraService {
  constructor(
    private readonly agenda: ConsultarAgendaVendedoraUseCase,
    private readonly desempenho: ConsultarDesempenhoVendedoraUseCase,
    private readonly produtos: ConsultarProdutosVendedoraUseCase,
    private readonly carteira: ConsultarCarteiraVendedoraUseCase,
    private readonly agendarContato: AgendarContatoVendedoraUseCase,
    private readonly relato: ProcessarRelatoVendedoraUseCase,
  ) {}

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
            linha:
              `${p.descricao} (${p.categoria} / ${p.familia})` +
              `${p.codigo ? ` — código ${p.codigo}` : ''}: ` +
              `${moeda(p.precoVenda)}, ` +
              `${p.emEstoque === 0 ? 'sem estoque' : `${p.emEstoque} em estoque`}`,
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
          default:
            return {
              status: r.status,
              mensagem:
                'Não encontrei esse cliente na carteira dela. Diga isso, sem sugerir que ele exista em outro lugar.',
            };
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
