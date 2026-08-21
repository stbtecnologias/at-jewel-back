import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import { ANASTASIA_GESTAO_SYSTEM } from '../../../agentes/application/personas';
import { LLM_CLIENT } from '../../../agentes/domain/ports/injection-tokens';
import type {
  GestaoLeituraResultado,
  ILlmClient,
} from '../../../agentes/domain/ports/llm-client.port';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { ConsultarAgendaVendedoraUseCase } from './consultar-agenda-vendedora.use-case';
import { ConsultarDesempenhoVendedoraUseCase } from './consultar-desempenho-vendedora.use-case';
import { ResolverVendedoraPorNomeUseCase } from './resolver-vendedora-por-nome.use-case';

export interface MensagemGestao {
  /** Nome de quem esta falando, para a agente tratar pelo primeiro nome. */
  nome: string | null;
  texto: string;
}

export interface RespostaGestao {
  resposta: string;
  motivo: 'conversa' | 'falha_agente';
}

const MAXIMO_CLIENTES_HOMONIMOS = 5;

/**
 * O canal interno da GESTAO.
 *
 * ==========================================================================
 * A IMAGEM EM ESPELHO DO CANAL DA VENDEDORA, E A COMPARACAO E O PONTO.
 *
 * La (`ProcessarMensagemInternaUseCase`) o `vendedoraId` entra por CLOSURE,
 * vindo do telefone, e nenhuma ferramenta aceita "de quem" — o escopo e
 * ausencia de caminho, nao regra de prompt.
 *
 * Aqui e o contrario por desenho: quem fala e da administracao, entao "de
 * quem" e justamente o que ela informa. As ferramentas sao OUTRAS
 * (`gestaoAgenda` e nao `consultarAgenda`), e e por isso que a assimetria se
 * sustenta: se eu tivesse acrescentado um `vendedora?` opcional as ferramentas
 * da vendedora, bastaria o modelo preencher esse campo no canal dela para o
 * escopo cair inteiro.
 *
 * As CONSULTAS por baixo sao as mesmas — elas sempre receberam `vendedoraId`
 * como parametro. O que muda e quem decide esse id: la o telefone, aqui o nome
 * que a pessoa falou.
 * ==========================================================================
 *
 * QUEM CHEGA AQUI JA FOI RECONHECIDO como usuario com permissao de gestao. A
 * verificacao mora no `BuscarAdminPorTelefoneUseCase`, antes desta chamada.
 */
@Injectable()
export class ProcessarMensagemGestaoUseCase {
  private readonly logger = new Logger(ProcessarMensagemGestaoUseCase.name);

  constructor(
    private readonly resolverVendedora: ResolverVendedoraPorNomeUseCase,
    private readonly agenda: ConsultarAgendaVendedoraUseCase,
    private readonly desempenho: ConsultarDesempenhoVendedoraUseCase,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
  ) {}

  async execute(msg: MensagemGestao): Promise<RespostaGestao> {
    const primeiroNome = msg.nome?.trim().split(/\s+/)[0] ?? null;
    const system =
      `${ANASTASIA_GESTAO_SYSTEM}\n\n` +
      (primeiroNome ? `Você está falando com ${primeiroNome}. ` : '') +
      `Agora são ${agoraLocal()} (fuso da loja) — use isto para entender "hoje", ` +
      `"amanhã" e horários relativos.`;

    try {
      const { texto } = await this.llm.chatComFerramentas({
        model: this.config.get<string>('ANTHROPIC_MODEL_GESTAO') ?? 'claude-opus-4-8',
        system,
        maxTokens: 700,
        mensagens: [{ role: 'user', content: limparEHigienizar(msg.texto) }],
        // Mesmo motivo do canal da vendedora: WhatsApp nao renderiza grafico.
        graficos: false,

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

        gestaoCarteiraDoCliente: async ({ cliente }) => {
          const achados = await this.clientes.buscarPorNomeParcial(cliente, MAXIMO_CLIENTES_HOMONIMOS + 1);
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
            linhas.push(`${c.nome} — ${dono}`);
          }

          return {
            status: achados.length > 1 ? 'AMBIGUO' : 'OK',
            linhas,
          };
        },
      });

      return { resposta: texto, motivo: 'conversa' };
    } catch (err) {
      this.logger.error(
        `Falha do agente de gestao: ${err instanceof Error ? err.message : err}`,
      );
      return {
        resposta: 'Não consegui consultar isso agora. Pode tentar de novo em instantes?',
        motivo: 'falha_agente',
      };
    }
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
    consulta: (vendedoraId: string) => Promise<string[]>,
  ): Promise<GestaoLeituraResultado> {
    const r = await this.resolverVendedora.execute(nome);
    if (r.status === 'AMBIGUA') return { status: 'AMBIGUA', linhas: [], nomes: r.nomes };
    if (r.status === 'NAO_ENCONTRADA') {
      return { status: 'NAO_ENCONTRADA', linhas: [], nomes: r.sugestoes };
    }
    return { status: 'OK', vendedora: r.nome, linhas: await consulta(r.id) };
  }
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function formatarQuando(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function agoraLocal(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}
