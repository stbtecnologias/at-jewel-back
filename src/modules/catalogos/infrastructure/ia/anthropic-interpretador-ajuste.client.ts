import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IInterpretadorDeAjuste } from '../../domain/ports/interpretador-ajuste.port';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

/**
 * SONNET, E NAO O HAIKU DAS OUTRAS LEITURAS.
 *
 * Conferir foto e ler clima de pagina sao leituras diretas. Aqui a frase e
 * livre ("tira aquele colar verde e poe o anel na modelo"), e errar a peca ou
 * a pagina custa uma geracao paga e uma versao errada. A chamada e uma por
 * pedido, entao a diferenca de preco nao pesa.
 */
const MODELO_PADRAO = 'claude-sonnet-5';

const TIMEOUT_MS = 45_000;
const MAX_TOKENS = 1_500;

/**
 * O PEDIDO AO MODELO.
 *
 * A lista de acoes e FECHADA e dita com os campos exatos: o que vier fora
 * dela e descartado na conferencia. E o que nao se faz por aqui (preco,
 * diagramacao fina) vai dito, para virar "nao entendi" com motivo em vez de
 * uma acao inventada.
 */
const INSTRUCOES =
  'Você recebe o resumo de um catálogo de joias em PDF, página por página, e ' +
  'o pedido de ajuste escrito por quem viu o PDF. Traduza o pedido em ações.\n\n' +
  'Responda SOMENTE com um JSON, sem texto antes ou depois:\n' +
  '{"acoes": [...], "nao_entendi": ["..."]}\n\n' +
  'Ações possíveis, com exatamente estes campos:\n' +
  '- {"tipo": "refazer_modelo", "pagina": N, "instrucao": "..."} — refazer a ' +
  'foto de uma página de MODELO (pose, expressão, luz, cenário, enquadramento);\n' +
  '- {"tipo": "trocar_modelo", "pagina": N, "codigo": "CÓDIGO", "instrucao": ' +
  '"..." ou null} — a página de MODELO passa a mostrar outra peça do catálogo;\n' +
  '- {"tipo": "refazer_capa", "instrucao": "..."} — outra arte de capa;\n' +
  '- {"tipo": "refazer_fundo", "instrucao": "..."} — outra arte de fundo das ' +
  'páginas de joias;\n' +
  '- {"tipo": "trocar_frase", "frase": "..."} — nova frase de capa, até 6 ' +
  'palavras. Se pedirem só "outra frase", crie uma no tom do tema;\n' +
  '- {"tipo": "tirar_peca", "codigo": "CÓDIGO"};\n' +
  '- {"tipo": "mover_peca", "codigo": "CÓDIGO", "pagina": N} — levar a peça ' +
  'para a página N;\n' +
  '- {"tipo": "mudar_cores", "fundo": "#RRGGBB", "destaque": "#RRGGBB", ' +
  '"texto": "#RRGGBB"} — fundo CLARO e texto ESCURO.\n\n' +
  'Regras:\n' +
  '- use os NÚMEROS DE PÁGINA e os CÓDIGOS do resumo. Se a pessoa descrever ' +
  'a peça ("o colar de turquesa"), ache o código pela descrição no resumo;\n' +
  '- preço, código, descrição e parcelamento NÃO se alteram por aqui;\n' +
  '- tamanho, posição exata, fonte e diagramação NÃO se alteram por aqui;\n' +
  '- catálogo SEM TEMA não tem modelo, arte de capa, fundo nem cores;\n' +
  '- o que não couber nas ações vai em "nao_entendi", em português, curto, ' +
  'citando o trecho do pedido e o motivo;\n' +
  '- não invente pedido que não foi feito.';

/**
 * A interpretacao do pedido de ajuste pelo Claude.
 *
 * HTTP direto, sem SDK — o mesmo caminho da conferencia e da direcao de arte.
 *
 * O QUE SAI DAQUI: o resumo do PDF (paginas, codigos e descricoes das pecas)
 * e o pedido. Nenhum preco, nenhum dado de cliente.
 */
@Injectable()
export class AnthropicInterpretadorDeAjusteClient implements IInterpretadorDeAjuste {
  private readonly logger = new Logger(
    AnthropicInterpretadorDeAjusteClient.name,
  );

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  async interpretar(resumo: string, pedido: string): Promise<unknown> {
    const chave = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!chave) return null;

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': chave,
          'anthropic-version': VERSAO_API,
        },
        body: JSON.stringify({
          model:
            this.config.get<string>('ANTHROPIC_MODEL_AJUSTE') ?? MODELO_PADRAO,
          max_tokens: MAX_TOKENS,
          system: INSTRUCOES,
          messages: [
            {
              role: 'user',
              content: `RESUMO DO PDF:\n${resumo}\n\nPEDIDO:\n${pedido}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        const corpo = await resp.text();
        this.logger.warn(
          `Anthropic /messages ${resp.status} no ajuste: ${corpo.slice(0, 200)}`,
        );
        return null;
      }

      const dados = (await resp.json()) as {
        content?: { type?: string; text?: string }[];
      };
      const texto = dados.content?.find((c) => c.type === 'text')?.text ?? '';
      return AnthropicInterpretadorDeAjusteClient.lerJson(texto);
    } catch (e) {
      this.logger.warn(
        `Interpretacao do ajuste nao concluida: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /** O JSON da resposta, mesmo com texto em volta. `null` se nao houver. */
  static lerJson(texto: string): unknown {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio === -1 || fim <= inicio) return null;
    try {
      return JSON.parse(texto.slice(inicio, fim + 1));
    } catch {
      return null;
    }
  }
}
