import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChatComFerramentasResultado,
  ChatParams,
  ChatResultado,
  GraficoDinamico,
  ILlmClient,
  PeriodoAgendaLlm,
  PeriodoVendasLlm,
} from '../../domain/ports/llm-client.port';

// Ferramenta de geracao de grafico (Anthropic tool-use). Vive aqui porque o
// schema e especifico do SDK; o dominio so conhece GraficoDinamico.
const CHART_TOOL: Anthropic.Tool = {
  name: 'gerar_grafico',
  description:
    'Gera um gráfico interativo exibido no painel de Analytics. Use quando dados ficam mais claros com visualização — comparações, tendências, distribuições.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: {
        type: 'string',
        enum: ['bar', 'line', 'pie', 'composed'],
        description: 'bar = barras; line = linha; pie = pizza; composed = barras + linha',
      },
      titulo: { type: 'string', description: 'Título descritivo do gráfico' },
      dados: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array de objetos — cada objeto é um ponto no gráfico',
      },
      chave_x: { type: 'string', description: 'Propriedade que vai no eixo X' },
      chaves_y: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chave: { type: 'string' },
            cor: { type: 'string', description: 'Cor hex, ex: #f59e0b' },
            rotulo: { type: 'string' },
          },
          required: ['chave', 'cor', 'rotulo'],
        },
        description: 'Uma ou mais séries de dados para o eixo Y',
      },
    },
    required: ['tipo', 'titulo', 'dados', 'chave_x', 'chaves_y'],
  },
};

interface ChartToolInput {
  tipo: GraficoDinamico['type'];
  titulo: string;
  dados: Array<Record<string, unknown>>;
  chave_x: string;
  chaves_y: { chave: string; cor: string; rotulo: string }[];
}

// Ferramenta de registro de demanda (RF-24). So e enviada ao modelo quando a
// aplicacao fornece um handler (ChatParams.registrarDemanda) — a persona da
// Anastasia no painel. O efeito colateral (gravar a demanda) roda no handler.
const DEMANDA_TOOL: Anthropic.Tool = {
  name: 'registrar_demanda',
  description:
    'Registra uma solicitação (demanda) da usuária para a equipe técnica quando você não consegue resolver na conversa ou quando a usuária pedir explicitamente para registrar. Use para pedidos de relatório novo, ajuste no sistema, dúvida técnica ou outro. Não use para responder algo que você mesma já consegue resolver.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: {
        type: 'string',
        enum: ['RELATORIO', 'AJUSTE', 'DUVIDA', 'OUTRO'],
        description:
          'RELATORIO = pedido de relatório/visão nova; AJUSTE = ajuste ou correção no sistema; DUVIDA = dúvida operacional; OUTRO = não se encaixa',
      },
      descricao: {
        type: 'string',
        description:
          'Descrição objetiva do que a usuária precisa, em uma ou duas frases. Sem dados pessoais de clientes.',
      },
    },
    required: ['tipo', 'descricao'],
  },
};

const AGENDA_TOOL: Anthropic.Tool = {
  name: 'consultar_agenda',
  description:
    'Consulta os compromissos JA AGENDADOS de quem esta falando com voce. Use quando ela perguntar sobre a agenda dela — "como esta minha agenda hoje", "tenho algum contato amanha", "o que tenho essa semana". Devolve com quem ela combinou de falar e a que horas. Voce NAO escolhe de quem e a agenda: e sempre a de quem esta na conversa, resolvida pelo telefone. Se ela perguntar pela agenda de outra pessoa, diga que voce so enxerga a dela.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['HOJE', 'AMANHA', 'SEMANA'],
        description:
          'HOJE = o que ainda vem hoje; AMANHA = o dia seguinte inteiro; SEMANA = os proximos sete dias. Na duvida, use HOJE.',
      },
    },
    required: ['periodo'],
  },
};

const VENDAS_TOOL: Anthropic.Tool = {
  name: 'consultar_vendas',
  description:
    'Consulta quantas vendas ELA fez e quanto faturou num periodo. Use quando ela perguntar sobre o proprio desempenho — "quantas vendas eu fiz hoje", "como foi minha semana", "quanto vendi no mes". Sao sempre as vendas DELA: voce nao escolhe de quem, o sistema resolve pelo telefone de quem esta falando.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['HOJE', 'SEMANA', 'MES'],
        description:
          'HOJE = desde a meia-noite; SEMANA = os ultimos sete dias; MES = os ultimos trinta dias.',
      },
    },
    required: ['periodo'],
  },
};

const METAS_TOOL: Anthropic.Tool = {
  name: 'consultar_metas',
  description:
    'Consulta as metas DELA: qual o alvo, quanto ja realizou, quanto falta e se ja bateu. Use quando ela perguntar sobre meta — "bati minha meta?", "quanto falta pra minha meta", "quais metas eu tenho". Nao precisa passar nada.',
  input_schema: { type: 'object', properties: {} },
};

const PRODUTOS_TOOL: Anthropic.Tool = {
  name: 'consultar_produtos',
  description:
    'Procura pecas no catalogo e devolve descricao, preco de venda e quantidade em estoque. Use quando ela perguntar sobre produto — "quanto custa o brinco de esmeralda", "tem alianca de ouro 18k", "quantos pingentes de zirconia temos". Devolve no maximo seis pecas. Voce nao tem acesso a custo nem margem: se ela perguntar isso, diga que nao consegue ver.',
  input_schema: {
    type: 'object',
    properties: {
      busca: {
        type: 'string',
        description:
          'O que procurar, nas palavras dela: nome da peca, categoria, familia, colecao, pedra, cor ou codigo do ERP. Ex.: "esmeralda", "alianca ouro 18k", "SEED-P0002".',
      },
    },
    required: ['busca'],
  },
};

const SEM_COMPRAR_TOOL: Anthropic.Tool = {
  name: 'clientes_sem_comprar',
  description:
    'Lista clientes DA CARTEIRA DELA que estao ha algum tempo sem comprar, do mais parado para o menos. Use quando ela perguntar quem esta sumido, parado, ha quanto tempo alguem nao compra, ou quem ela deveria procurar. Inclui quem nunca comprou. So enxerga a carteira dela.',
  input_schema: {
    type: 'object',
    properties: {
      meses: {
        type: 'integer',
        description:
          'Quantos meses sem comprar. Se ela nao disser um numero, use 6.',
      },
    },
    required: ['meses'],
  },
};

const MELHORES_TOOL: Anthropic.Tool = {
  name: 'melhores_clientes',
  description:
    'Lista os clientes DA CARTEIRA DELA que mais compraram, do maior para o menor. Sem categoria conta COMPRAS ("quem mais compra de mim"); com categoria conta PECAS daquele tipo ("quem comprou mais aneis"). So enxerga a carteira dela.',
  input_schema: {
    type: 'object',
    properties: {
      categoria: {
        type: 'string',
        description:
          'Categoria da peca, no singular, como aparece no catalogo: "Anel", "Colar", "Brinco", "Pulseira", "Pingente", "Alianca". Omita para contar todas as compras.',
      },
      ultimos_meses: {
        type: 'integer',
        description:
          'Recorte de periodo, em meses. Omita para considerar o historico inteiro.',
      },
    },
  },
};

const RELATO_TOOL: Anthropic.Tool = {
  name: 'registrar_relato',
  description:
    'Registra o que a vendedora acabou de contar sobre o contato dela com o cliente que esta pendente. Use quando a mensagem dela responder "como foi com o cliente" — se falou, se nao conseguiu falar, se o cliente pediu para remarcar, se fechou venda ou desistiu. NAO use para outros assuntos: pergunta sobre agenda, sobre numeros, ou conversa solta nao sao relato. Voce nao precisa passar nada: o sistema le a mensagem original dela.',
  input_schema: { type: 'object', properties: {} },
};

const AVISAR_TOOL: Anthropic.Tool = {
  name: 'avisar_vendedora',
  description:
    'Avisa pelo WhatsApp a vendedora responsavel por um cliente de que ele pediu atendimento. Use quando a usuaria disser algo como "o cliente Henrique quer atendimento, avise a vendedora dele". Voce NAO escolhe a vendedora: o sistema descobre quem e a partir da carteira do cliente. Passe apenas o nome do cliente como a usuaria falou, e o assunto e o horario se ela mencionar.',
  input_schema: {
    type: 'object',
    properties: {
      cliente: {
        type: 'string',
        description:
          'Nome do cliente como a usuaria escreveu. Nao invente sobrenome nem complete o nome.',
      },
      assunto: {
        type: 'string',
        description:
          'O que o cliente procura, em poucas palavras (ex.: "colar de safira"). Omita se a usuaria nao disser.',
      },
      quando: {
        type: 'string',
        description:
          'Horario ou momento combinado, nas palavras da usuaria (ex.: "hoje no fim da tarde"). Omita se ela nao disser.',
      },
      quando_iso: {
        type: 'string',
        description:
          'O MESMO horario em ISO 8601 com fuso (ex.: "2026-08-19T17:00:00-03:00"), calculado a partir da data de hoje informada no system prompt. E o que permite agendar a cobranca. Preencha SEMPRE que houver um horario identificavel; omita se a usuaria falou algo vago como "mais tarde".',
      },
      ocasiao: {
        type: 'string',
        enum: [
          'CASAMENTO',
          'NOIVADO',
          'ANIVERSARIO',
          'FORMATURA',
          'DATA_COMEMORATIVA',
          'AUTOPRESENTE',
          'OUTRO',
        ],
        description:
          'Para qual acontecimento o cliente procura a peca, se a usuaria disser. Nao adivinhe: omita quando ela nao mencionar.',
      },
    },
    required: ['cliente'],
  },
};

interface AvisarToolInput {
  cliente?: unknown;
  assunto?: unknown;
  quando?: unknown;
  quando_iso?: unknown;
  ocasiao?: unknown;
}

// Tetos defensivos para o que vem do modelo e entra no texto enviado a
// vendedora — o `assunto` e o `quando` sao os unicos trechos originados na
// conversa, e uma mensagem de WhatsApp nao tem por que ser longa.
const AVISO_CLIENTE_MAX = 120;
const AVISO_TRECHO_MAX = 160;

interface DemandaToolInput {
  tipo: 'RELATORIO' | 'AJUSTE' | 'DUVIDA' | 'OUTRO';
  descricao: string;
}

// Limite defensivo para a descricao vinda do modelo (espelha o MaxLength do DTO).
const DEMANDA_DESCRICAO_MAX = 4000;

@Injectable()
export class AnthropicClient implements ILlmClient {
  private readonly logger = new Logger(AnthropicClient.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    // O SDK aceita apiKey vazia na construcao; falha so no request. Logamos
    // para deixar claro em ambiente sem chave (dev) que os agentes nao operam.
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY ausente — agentes nao conseguirao responder.');
    }
    this.client = new Anthropic({ apiKey: apiKey ?? '' });
  }

  async chat(params: ChatParams): Promise<ChatResultado> {
    const resp = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: this.toApiMessages(params.mensagens),
    });
    return { texto: this.extrairTexto(resp), tokens: resp.usage.output_tokens };
  }

  async chatComFerramentas(params: ChatParams): Promise<ChatComFerramentasResultado> {
    const apiMessages = this.toApiMessages(params.mensagens);

    // Cada ferramenta so entra quando a aplicacao fornece o handler. O
    // grafico e a excecao historica: nasceu antes dos handlers e vale por
    // padrao, mas o canal de WhatsApp desliga (ver ChatParams.graficos).
    const tools: Anthropic.Tool[] = [];
    if (params.graficos ?? true) tools.push(CHART_TOOL);
    if (params.registrarDemanda) tools.push(DEMANDA_TOOL);
    if (params.avisarVendedora) tools.push(AVISAR_TOOL);
    if (params.consultarAgenda) tools.push(AGENDA_TOOL);
    if (params.registrarRelato) tools.push(RELATO_TOOL);
    if (params.consultarVendas) tools.push(VENDAS_TOOL);
    if (params.consultarMetas) tools.push(METAS_TOOL);
    if (params.consultarProdutos) tools.push(PRODUTOS_TOOL);
    if (params.clientesSemComprar) tools.push(SEM_COMPRAR_TOOL);
    if (params.melhoresClientes) tools.push(MELHORES_TOOL);

    const first = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      tools,
      messages: apiMessages,
    });

    let tokens = first.usage.output_tokens;

    const toolUses = first.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      return { texto: this.extrairTexto(first), tokens };
    }

    // Processa cada tool_use, acumulando o resultado (grafico) e os
    // tool_result que voltam ao modelo na continuacao.
    let grafico: GraficoDinamico | undefined;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    // Teto: 1 demanda por turno de chat, mesmo que o modelo emita varios
    // blocos registrar_demanda (mitiga criacao em massa via prompt injection).
    let demandaRegistrada = false;
    // Mesmo teto para o aviso: um WhatsApp disparado por turno, no maximo.
    let avisoEnviado = false;
    // E para o relato: uma gravacao por mensagem dela.
    let relatoGravado = false;

    for (const toolUse of toolUses) {
      if (toolUse.name === 'gerar_grafico') {
        const input = toolUse.input as ChartToolInput;
        grafico = {
          type: input.tipo,
          title: input.titulo,
          data: input.dados,
          xKey: input.chave_x,
          yKeys: input.chaves_y.map((y) => ({
            key: y.chave,
            color: y.cor,
            label: y.rotulo,
          })),
        };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Gráfico gerado com sucesso e já apareceu no painel de Analytics.',
        });
      } else if (toolUse.name === 'registrar_demanda' && params.registrarDemanda) {
        if (demandaRegistrada) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              'Ignorado: apenas uma demanda pode ser registrada por mensagem. Oriente a usuária a enviar as demais separadamente.',
            is_error: true,
          });
          continue;
        }
        demandaRegistrada = true;
        toolResults.push(
          await this.executarRegistrarDemanda(toolUse, params.registrarDemanda),
        );
      } else if (toolUse.name === 'registrar_relato' && params.registrarRelato) {
        if (relatoGravado) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Ignorado: o relato desta mensagem ja foi registrado.',
            is_error: true,
          });
          continue;
        }
        relatoGravado = true;
        toolResults.push(
          await this.executarRegistrarRelato(toolUse, params.registrarRelato),
        );
      } else if (toolUse.name === 'consultar_vendas' && params.consultarVendas) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { resumo } = await params.consultarVendas!({
              periodo: (toolUse.input as { periodo?: PeriodoVendasLlm }).periodo ?? 'HOJE',
            });
            return (
              `Vendas dela no periodo: ${resumo}. Repasse estes numeros exatamente ` +
              'como estao, em uma ou duas frases naturais.'
            );
          }),
        );
      } else if (toolUse.name === 'consultar_metas' && params.consultarMetas) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { metas } = await params.consultarMetas!();
            if (metas.length === 0) {
              return 'Ela nao tem meta cadastrada no momento. Diga isso em uma frase, sem inventar numero.';
            }
            return (
              `Metas dela:\n${metas.map((m) => `- ${m.linha}`).join('\n')}\n\n` +
              'Repasse os numeros exatamente como estao.'
            );
          }),
        );
      } else if (toolUse.name === 'consultar_produtos' && params.consultarProdutos) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { produtos } = await params.consultarProdutos!({
              busca: String((toolUse.input as { busca?: string }).busca ?? '').slice(0, 120),
            });
            if (produtos.length === 0) {
              return 'Nenhuma peca encontrada com esse termo. Diga isso a ela e pergunte se quer procurar de outro jeito.';
            }
            return (
              `Pecas encontradas:\n${produtos.map((p) => `- ${p.linha}`).join('\n')}\n\n` +
              'Repasse os precos e quantidades exatamente como estao. Se ela pedir custo ou margem, diga que voce nao consegue ver isso.'
            );
          }),
        );
      } else if (toolUse.name === 'clientes_sem_comprar' && params.clientesSemComprar) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const entrada = toolUse.input as { meses?: number };
            const { clientes } = await params.clientesSemComprar!({
              meses: Number(entrada.meses) > 0 ? Number(entrada.meses) : 6,
            });
            if (clientes.length === 0) {
              return 'Nenhum cliente da carteira dela esta parado nesse periodo. Diga isso em uma frase.';
            }
            return (
              `Clientes parados:\n${clientes.map((c) => `- ${c.linha}`).join(`\n`)}\n\n` +
              'Repasse os nomes e as datas exatamente como estao.'
            );
          }),
        );
      } else if (toolUse.name === 'melhores_clientes' && params.melhoresClientes) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const entrada = toolUse.input as {
              categoria?: string;
              ultimos_meses?: number;
            };
            const { clientes } = await params.melhoresClientes!({
              categoria: entrada.categoria,
              ultimosMeses: entrada.ultimos_meses,
            });
            if (clientes.length === 0) {
              return 'Nenhuma compra encontrada na carteira dela com esse recorte. Diga isso em uma frase.';
            }
            return (
              `Maiores compradores:\n${clientes.map((c) => `- ${c.linha}`).join(`\n`)}\n\n` +
              'Repasse os nomes e numeros exatamente como estao.'
            );
          }),
        );
      } else if (toolUse.name === 'consultar_agenda' && params.consultarAgenda) {
        toolResults.push(
          await this.executarConsultarAgenda(toolUse, params.consultarAgenda),
        );
      } else if (toolUse.name === 'avisar_vendedora' && params.avisarVendedora) {
        if (avisoEnviado) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              'Ignorado: apenas um aviso por mensagem. Peca a usuaria para tratar um cliente de cada vez.',
            is_error: true,
          });
          continue;
        }
        avisoEnviado = true;
        toolResults.push(
          await this.executarAvisarVendedora(toolUse, params.avisarVendedora),
        );
      }
    }

    // Continuacao: devolve os tool_result e pede o comentario final.
    const cont = await this.client.messages.create({
      model: params.model,
      max_tokens: 1024,
      system: params.system,
      tools,
      messages: [
        ...apiMessages,
        { role: 'assistant', content: first.content },
        { role: 'user', content: toolResults },
      ],
    });

    tokens += cont.usage.output_tokens;
    return { texto: this.extrairTexto(cont), tokens, grafico };
  }

  /**
   * Envelope comum das ferramentas de LEITURA do canal interno.
   *
   * Sem teto de chamadas: ler duas vezes na mesma mensagem ("e amanha? e a
   * meta?") e uso legitimo. Falha vira tool_result de erro, e o modelo se
   * recupera na conversa em vez de derrubar a resposta inteira.
   */
  private async executarLeitura(
    toolUse: Anthropic.ToolUseBlock,
    corpo: () => Promise<string>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    try {
      return { type: 'tool_result', tool_use_id: toolUse.id, content: await corpo() };
    } catch (err) {
      this.logger.error(
        `Falha na ferramenta ${toolUse.name}: ${err instanceof Error ? err.message : err}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content:
          'Nao consegui consultar isso agora. Peca desculpa e diga que ela pode tentar de novo em instantes.',
        is_error: true,
      };
    }
  }

  /**
   * Executa `registrar_relato`. O texto de volta ja vem pronto do servidor —
   * o modelo repassa, nao reescreve, porque a frase carrega horario remarcado
   * e desfecho, que sao exatamente o que ele inventaria.
   */
  private async executarRegistrarRelato(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['registrarRelato']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    try {
      const r = await handler();

      if (r.status === 'SEM_PENDENCIA') {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            'Nao ha retorno pendente dela. Diga que nao ha acompanhamento aberto no momento e que, quando voce encaminhar um cliente, ela conta por aqui como foi.',
        };
      }

      if (r.status === 'NAO_ENTENDI') {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            'Nao deu para entender o relato. Pergunte a ela, em uma frase, se chegou a falar com o cliente e, se ficou de retornar, qual o horario.',
        };
      }

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `Relato registrado. Responda a ela exatamente isto, sem alterar horarios nem nomes: "${r.mensagem}"`,
      };
    } catch (err) {
      this.logger.error(
        `Falha ao registrar o relato: ${err instanceof Error ? err.message : err}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content:
          'Nao consegui registrar agora. Peca desculpa e diga que ela pode repetir em instantes.',
        is_error: true,
      };
    }
  }

  /**
   * Executa `consultar_agenda`. Sem teto de chamadas: e leitura, e perguntar
   * "e amanha?" na mesma mensagem e uso legitimo.
   *
   * O tool_result ja vai FORMATADO. O modelo repassa o que esta escrito em vez
   * de recalcular horario — data e hora sao exatamente onde ele inventa.
   */
  private async executarConsultarAgenda(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['consultarAgenda']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const input = toolUse.input as { periodo?: PeriodoAgendaLlm };
    try {
      const { compromissos } = await handler({
        periodo: input.periodo ?? 'HOJE',
      });

      if (compromissos.length === 0) {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            'Nenhum compromisso agendado nesse periodo. Diga isso a ela em uma frase, sem inventar nada.',
        };
      }

      const linhas = compromissos
        .map(
          (c) =>
            `- ${c.cliente}, ${c.quando}${c.ocasiao ? ` (${c.ocasiao.toLowerCase()})` : ''}`,
        )
        .join('\n');

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content:
          `Compromissos dela:\n${linhas}\n\nRepasse exatamente estes nomes e horarios, ` +
          'sem alterar nem completar. Escreva em uma ou duas frases naturais.',
      };
    } catch (err) {
      this.logger.error(
        `Falha ao consultar a agenda: ${err instanceof Error ? err.message : err}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content:
          'Nao consegui consultar a agenda agora. Peca desculpa e diga que ela pode tentar de novo em instantes.',
        is_error: true,
      };
    }
  }

  // Executa a tool registrar_demanda e monta o tool_result. Nunca loga a
  // descricao (texto livre). Em falha, devolve um tool_result de erro para o
  // modelo se recuperar na conversa sem derrubar o chat.
  private async executarRegistrarDemanda(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['registrarDemanda']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const input = toolUse.input as DemandaToolInput;
    try {
      const { id } = await handler({
        tipo: input.tipo,
        descricao: (input.descricao ?? '').slice(0, DEMANDA_DESCRICAO_MAX),
      });
      const idCurto = id.slice(0, 8);
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `Demanda registrada com sucesso (protocolo ${idCurto}). A equipe técnica vai acompanhar. Informe o protocolo à usuária e diga que o time dará retorno.`,
      };
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar demanda via tool: ${(erro as Error).message}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          'Não foi possível registrar a demanda agora. Peça desculpas à usuária e sugira tentar novamente em instantes.',
      };
    }
  }

  private async executarAvisarVendedora(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['avisarVendedora']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const input = toolUse.input as AvisarToolInput;
    const texto = (v: unknown, max: number): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const limpo = v.trim().slice(0, max);
      return limpo.length > 0 ? limpo : undefined;
    };

    const cliente = texto(input.cliente, AVISO_CLIENTE_MAX);
    if (!cliente) {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          'Faltou o nome do cliente. Pergunte à usuária de qual cliente se trata.',
      };
    }

    try {
      const r = await handler({
        cliente,
        assunto: texto(input.assunto, AVISO_TRECHO_MAX),
        quando: texto(input.quando, AVISO_TRECHO_MAX),
        quandoIso: texto(input.quando_iso, 40),
        ocasiao: texto(input.ocasiao, 30),
      });
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        // Falha de NEGOCIO (cliente sem vendedora, por exemplo) nao e erro de
        // ferramenta: o modelo precisa explicar o motivo à usuária, nao pedir
        // desculpas por uma falha tecnica.
        is_error: r.status === 'FALHA_ENVIO' ? true : undefined,
        content: r.mensagem,
      };
    } catch (erro) {
      this.logger.error(
        `Falha ao avisar vendedora via tool: ${(erro as Error).message}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          'Não foi possível avisar a vendedora agora. Peça desculpas à usuária e sugira tentar novamente em instantes.',
      };
    }
  }

  private toApiMessages(
    mensagens: ChatParams['mensagens'],
  ): Anthropic.MessageParam[] {
    return mensagens.map((m) => ({ role: m.role, content: m.content }));
  }

  private extrairTexto(resp: Anthropic.Message): string {
    const bloco = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return bloco?.text ?? '';
  }
}
