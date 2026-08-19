import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChatComGraficoResultado,
  ChatParams,
  ChatResultado,
  GraficoDinamico,
  ILlmClient,
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
    },
    required: ['cliente'],
  },
};

interface AvisarToolInput {
  cliente?: unknown;
  assunto?: unknown;
  quando?: unknown;
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

  async chatComGrafico(params: ChatParams): Promise<ChatComGraficoResultado> {
    const apiMessages = this.toApiMessages(params.mensagens);

    // registrar_demanda so entra quando a aplicacao fornece o handler.
    const tools: Anthropic.Tool[] = [CHART_TOOL];
    if (params.registrarDemanda) tools.push(DEMANDA_TOOL);
    if (params.avisarVendedora) tools.push(AVISAR_TOOL);

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
