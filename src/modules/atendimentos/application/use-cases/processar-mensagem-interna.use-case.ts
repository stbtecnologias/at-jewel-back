import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import { ELENA_INTERNA_SYSTEM } from '../../../agentes/application/personas';
import { LLM_CLIENT } from '../../../agentes/domain/ports/injection-tokens';
import type { ILlmClient } from '../../../agentes/domain/ports/llm-client.port';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { BuscarVendedoraPorWhatsappUseCase } from '../../../vendedoras/application/use-cases/buscar-vendedora-por-whatsapp.use-case';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';
import { ConsultarAgendaVendedoraUseCase } from './consultar-agenda-vendedora.use-case';
import { ConsultarDesempenhoVendedoraUseCase } from './consultar-desempenho-vendedora.use-case';
import { ConsultarCarteiraVendedoraUseCase } from './consultar-carteira-vendedora.use-case';
import { ConsultarProdutosVendedoraUseCase } from './consultar-produtos-vendedora.use-case';
import { ProcessarRelatoVendedoraUseCase } from './processar-relato-vendedora.use-case';

export interface MensagemInterna {
  /** Chat de origem, ja traduzido de LID para telefone na borda HTTP. */
  de: string;
  texto: string;
}

export interface RespostaInterna {
  /** Texto a devolver, ou null quando a mensagem deve ser ignorada em silencio. */
  resposta: string | null;
  /** Rotulo do que aconteceu, para o log. Nunca contem PII. */
  motivo:
    | 'ignorado_remetente_desconhecido'
    | 'relato_registrado'
    | 'conversa'
    | 'falha_agente';
}

/**
 * Porta de entrada do canal INTERNO de WhatsApp (vendedoras).
 *
 * DEFAULT-DENY POR REMETENTE, e essa e a primeira coisa que acontece: telefone
 * que nao pertence a uma vendedora ativa nao recebe resposta e NAO chega ao
 * LLM. Nao e "numero secreto e torcer" — e verificacao no banco, pelo HMAC do
 * telefone, antes de qualquer processamento.
 *
 * Silencio, e nao uma mensagem de erro, e deliberado: responder "voce nao esta
 * cadastrado" confirmaria a quem sondasse que existe um canal aqui.
 *
 * ==========================================================================
 * O AGENTE VEM ANTES DO RELATO, e a ordem importa.
 *
 * Ate 20/08/2026 toda mensagem ia direto para o extrator de relato. Ao ganhar
 * ferramentas, manter essa ordem seria perigoso: uma pergunta como "como esta
 * minha agenda hoje?" chegando com cobranca aberta cairia num extrator que
 * procura {contatou, resultado} — e ele poderia devolver NAO_CONSEGUIU_FALAR,
 * gravando um relato falso e agendando retomada. Errado e silencioso.
 *
 * Entao quem decide o que a mensagem E e o agente, e registrar o relato virou
 * ferramenta dele. A EXTRACAO continua identica, no
 * ProcessarRelatoVendedoraUseCase: o agente roteia, o especialista extrai.
 *
 * ESCOPO: as ferramentas recebem o `vendedoraId` por CLOSURE, resolvido do
 * telefone. Nenhuma aceita "de quem" como parametro — nao e regra de prompt, e
 * ausencia de caminho.
 * ==========================================================================
 */
@Injectable()
export class ProcessarMensagemInternaUseCase {
  private readonly logger = new Logger(ProcessarMensagemInternaUseCase.name);

  constructor(
    private readonly identificarVendedora: BuscarVendedoraPorWhatsappUseCase,
    private readonly relato: ProcessarRelatoVendedoraUseCase,
    private readonly agenda: ConsultarAgendaVendedoraUseCase,
    private readonly desempenho: ConsultarDesempenhoVendedoraUseCase,
    private readonly produtos: ConsultarProdutosVendedoraUseCase,
    private readonly carteira: ConsultarCarteiraVendedoraUseCase,
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
  ) {}

  async execute(msg: MensagemInterna): Promise<RespostaInterna> {
    const telefone = msg.de.replace(/@.*$/, '');
    const vendedora = await this.identificarVendedora.execute(telefone);

    if (!vendedora?.id) {
      // Nao logamos o numero: e PII, e o log e o lugar mais facil de vazar.
      this.logger.debug('Mensagem interna de remetente nao reconhecido — ignorada.');
      return { resposta: null, motivo: 'ignorado_remetente_desconhecido' };
    }

    const vendedoraId = vendedora.id;
    const primeiroNome = vendedora.nome.trim().split(/\s+/)[0];
    // A carteira e por codigo do ERP, nao por id — e o mesmo campo que o
    // avisar_vendedora usa. Vendedora sem codigo simplesmente nao tem
    // carteira, e as ferramentas devolvem vazio.
    const codigoErp = vendedora.codigoErp;

    // O que o agente precisa saber antes de decidir. Pre-carregado como DADO,
    // do mesmo jeito que a Anastasia do painel recebe o contexto da aba.
    const pendencia = await this.montarContextoPendencia(vendedoraId);

    const system =
      `${ELENA_INTERNA_SYSTEM}\n\n` +
      `Você está falando com ${primeiroNome}. Agora são ${agoraLocal()} (fuso da loja) — ` +
      `use isto para entender "hoje", "amanhã" e horários relativos.\n\n${pendencia}`;

    let relatoRegistrado = false;

    try {
      const { texto } = await this.llm.chatComFerramentas({
        model: this.config.get<string>('ANTHROPIC_MODEL_INTERNO') ?? 'claude-opus-4-8',
        system,
        maxTokens: 700,
        mensagens: [{ role: 'user', content: limparEHigienizar(msg.texto) }],
        // WhatsApp nao renderiza grafico. Oferecer a ferramenta so convida o
        // modelo a tentar e depois se desculpar.
        graficos: false,
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
          const achados = await this.carteira.semComprar(codigoErp, meses);
          return {
            clientes: achados.map((c) => ({
              linha: c.ultimaCompra
                ? `${c.nome} — última compra em ${c.ultimaCompra.toLocaleDateString(`pt-BR`)}, ${c.quantidade} ${c.quantidade === 1 ? `compra` : `compras`} no total`
                : `${c.nome} — nunca comprou`,
            })),
          };
        },
        melhoresClientes: async ({ categoria, ultimosMeses }) => {
          const achados = await this.carteira.maioresCompradores(codigoErp, {
            categoria,
            ultimosMeses,
          });
          const unidade = categoria ? `peça` : `compra`;
          return {
            clientes: achados.map((c) => ({
              linha: `${c.nome} — ${c.quantidade} ${c.quantidade === 1 ? unidade : unidade + `s`}, ${moeda(c.valorTotal)}`,
            })),
          };
        },
        registrarRelato: async () => {
          // O texto ORIGINAL, nao o que o modelo entendeu: o relato guardado
          // tem que ser a frase dela.
          const r = await this.relato.execute(vendedoraId, msg.texto);
          if (r.status === 'REGISTRADO') relatoRegistrado = true;
          return {
            status: r.status,
            mensagem: r.status === 'REGISTRADO' ? r.resposta : '',
          };
        },
      });

      return {
        resposta: texto,
        motivo: relatoRegistrado ? 'relato_registrado' : 'conversa',
      };
    } catch (err) {
      this.logger.error(
        `Falha do agente interno: ${err instanceof Error ? err.message : err}`,
      );
      return {
        resposta:
          'Tive um problema aqui do meu lado agora. Pode me mandar de novo daqui a pouco?',
        motivo: 'falha_agente',
      };
    }
  }

  /**
   * A cobranca aberta, se houver, entra no prompt como CONTEXTO — e o que
   * permite o agente reconhecer "falei com ela, pediu para retornar amanha"
   * como relato daquele cliente, em vez de conversa solta.
   *
   * Sem cobranca aberta, a frase diz isso — para ele nao chamar a ferramenta a
   * toa e acabar registrando relato de um contato que ninguem pediu.
   */
  private async montarContextoPendencia(vendedoraId: string): Promise<string> {
    const pendencia = await this.atendimentos.buscarCobrancaAguardando(vendedoraId);
    if (!pendencia) {
      return 'Não há retorno pendente dela no momento — ninguém está esperando relato de contato. Não use a ferramenta registrar_relato.';
    }

    const cliente = await this.clientes.buscarPorId(pendencia.atendimento.clienteId);
    const nome = cliente?.nome ?? 'um cliente';

    return (
      `Você perguntou a ela há pouco como foi o contato com ${nome}, e ainda espera a resposta. ` +
      'Se a mensagem dela for sobre esse contato — se falou, se não conseguiu falar, se remarcou —, ' +
      'use a ferramenta registrar_relato. Se for outro assunto, responda normalmente e não registre nada.'
    );
  }
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/** "hoje às 15:00", "amanhã às 10:00", "sexta-feira às 09:30", "28/08 às 14:00". */
function formatarQuando(d: Date): string {
  const agora = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const soDia = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = (soDia(d) - soDia(agora)) / 86_400_000;

  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias > 1 && dias < 7) {
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long' })} às ${hora}`;
  }
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

function agoraLocal(): string {
  const agora = new Date();
  const dia = agora.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia}, ${hora}`;
}
