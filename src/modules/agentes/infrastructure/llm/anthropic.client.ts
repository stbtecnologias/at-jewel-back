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

    const first = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      tools: [CHART_TOOL],
      messages: apiMessages,
    });

    let tokens = first.usage.output_tokens;

    const toolUse = first.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'gerar_grafico',
    );

    if (!toolUse) {
      return { texto: this.extrairTexto(first), tokens };
    }

    const input = toolUse.input as ChartToolInput;
    const grafico: GraficoDinamico = {
      type: input.tipo,
      title: input.titulo,
      data: input.dados,
      xKey: input.chave_x,
      yKeys: input.chaves_y.map((y) => ({ key: y.chave, color: y.cor, label: y.rotulo })),
    };

    // Continuacao: devolve o tool_result e pede o comentario final.
    const cont = await this.client.messages.create({
      model: params.model,
      max_tokens: 1024,
      system: params.system,
      tools: [CHART_TOOL],
      messages: [
        ...apiMessages,
        { role: 'assistant', content: first.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: 'Gráfico gerado com sucesso e já apareceu no painel de Analytics.',
            },
          ],
        },
      ],
    });

    tokens += cont.usage.output_tokens;
    return { texto: this.extrairTexto(cont), tokens, grafico };
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
