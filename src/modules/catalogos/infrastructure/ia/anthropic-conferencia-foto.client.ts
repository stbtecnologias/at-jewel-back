import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IConferenciaFoto,
  VereditoFoto,
} from '../../domain/ports/conferencia-foto.port';
import type { ImagemDeEntrada } from '../../domain/ports/tratamento-imagem.port';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

/**
 * O MODELO MAIS BARATO DA CASA, e de proposito.
 *
 * A pergunta e "tem uma joia nesta foto?" — reconhecimento direto, sem
 * raciocinio. Pagar o modelo grande por isso sairia caro numa etapa que roda
 * em TODA foto que chega.
 */
const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

/**
 * Curto de proposito: esta chamada esta no caminho da resposta ao WhatsApp.
 * Estourando, a foto segue para o tratamento — ver `null` na porta.
 */
const TIMEOUT_MS = 15_000;

/** Teto da resposta: o modelo devolve um JSON de tres campos. */
const MAX_TOKENS = 200;

/**
 * O QUE SE PERGUNTA — e o cuidado esta no que NAO se pergunta.
 *
 * Nao perguntamos se a foto e boa, se esta nitida ou se a peca e bonita. A
 * foto do estoque e tirada com celular, em cima do balcao, e e para isso que
 * o tratamento existe. A unica pergunta e se ha um PRODUTO ali.
 *
 * ==========================================================================
 * PRODUTO, E NAO "JOIA" — decisao do Lucas em 15/09/2026.
 *
 * A primeira versao perguntava por joia. Mas o canal ja tratou uma GARRAFA em
 * 01/09 (esta no comentario do tamanho da imagem, no cliente de tratamento), e
 * o catalogo nao promete ser so de joia.
 *
 * E o defeito que esta conferencia existe para matar nao e "fotografaram
 * outra categoria": e a INVENCAO, que acontece quando nao ha produto nenhum
 * na foto. O notebook cai nos dois criterios; a garrafa so cairia no
 * primeiro, e injustamente.
 * ==========================================================================
 *
 * "NA DUVIDA, SERVE" ESTA ESCRITO NO PROMPT porque o custo dos dois erros e
 * diferente: recusar foto boa trava o trabalho do estoque; aceitar foto ruim
 * gasta uma geracao e cai na aprovacao humana, que ja existe.
 */
const PERGUNTA =
  'Você confere fotos de produtos antes de elas irem para tratamento de ' +
  'imagem, numa loja de joias.\n\n' +
  'Olhe a imagem e responda SÓ com um JSON, sem cercar com crase e sem ' +
  'explicação:\n' +
  '{"serve": true|false, "motivo": "sem_peca"|"varias_pecas"|null, ' +
  '"viu": "<o que aparece na foto, em até 6 palavras>"}\n\n' +
  'Critério:\n' +
  '- serve=true quando há UM produto identificável sendo fotografado para ' +
  'venda: joia ou bijuteria (anel, brinco, colar, pulseira, pingente, ' +
  'piercing, aliança, relógio, berloque) e também qualquer outro item de ' +
  'loja — bolsa, garrafa, acessório, embalagem, peça de decoração. ' +
  'Foto tremida, escura, de longe, com mão segurando, com fundo bagunçado ' +
  'ou sobre embalagem CONTINUA servindo — é isso que o tratamento conserta.\n' +
  '- serve=false, motivo "sem_peca", quando NÃO há produto nenhum sendo ' +
  'fotografado: documento, tela de computador ou celular, teclado, print, ' +
  'ambiente ou cômodo, móvel de loja, pessoa, animal, comida, paisagem, ' +
  'veículo, foto de uma foto.\n' +
  '- serve=false, motivo "varias_pecas", quando há vários produtos distintos ' +
  'e não dá para saber qual é o da vez. Par de brincos é UM produto. ' +
  'Peça com pedras, correntes ou pingentes é UM produto.\n\n' +
  'NA DÚVIDA, responda serve=true.';

/**
 * A conferencia da foto pelo Claude.
 *
 * HTTP direto, sem SDK — mesmo caminho do cliente de tratamento e do de
 * transcricao. Uma chamada so nao paga o custo de mais um pacote.
 *
 * O QUE SAI DAQUI: a foto da peca e mais nada. Nem legenda, nem nome de quem
 * mandou, nem dado do ERP.
 */
@Injectable()
export class AnthropicConferenciaFotoClient implements IConferenciaFoto {
  private readonly logger = new Logger(AnthropicConferenciaFotoClient.name);

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  async conferir(imagem: ImagemDeEntrada): Promise<VereditoFoto | null> {
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
            this.config.get<string>('ANTHROPIC_MODEL_CONFERENCIA') ??
            MODELO_PADRAO,
          max_tokens: MAX_TOKENS,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: imagem.mime,
                    data: imagem.conteudo.toString('base64'),
                  },
                },
                { type: 'text', text: PERGUNTA },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        // Sem PII no corpo do erro: ele fala de modelo, cota e formato.
        const corpo = await resp.text();
        this.logger.warn(
          `Anthropic /messages ${resp.status} na conferencia: ${corpo.slice(0, 200)}`,
        );
        return null;
      }

      const dados = (await resp.json()) as {
        content?: { type?: string; text?: string }[];
      };
      const texto = dados.content?.find((c) => c.type === 'text')?.text;
      return texto ? this.lerVeredito(texto) : null;
    } catch (e) {
      // Timeout e rede caem aqui. `null` = "nao sei", e a foto segue.
      this.logger.warn(
        `Conferencia da foto nao concluida: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * Le o JSON da resposta.
   *
   * TOLERANTE COM A BORDA, ESTRITO COM O CONTEUDO: o modelo as vezes cerca o
   * JSON com crase ou escreve uma frase antes, entao o primeiro `{` ate o
   * ultimo `}` e o que se aproveita. Mas so `serve === false` com motivo
   * conhecido recusa — qualquer outra coisa deixa passar, que e a regra da
   * duvida.
   */
  private lerVeredito(texto: string): VereditoFoto | null {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio === -1 || fim <= inicio) return null;

    let bruto: { serve?: unknown; motivo?: unknown; viu?: unknown };
    try {
      bruto = JSON.parse(texto.slice(inicio, fim + 1)) as typeof bruto;
    } catch {
      this.logger.warn('Conferencia devolveu texto que nao e JSON.');
      return null;
    }

    const viu = typeof bruto.viu === 'string' ? bruto.viu.trim() : null;
    const motivo =
      bruto.motivo === 'sem_peca' || bruto.motivo === 'varias_pecas'
        ? bruto.motivo
        : null;

    if (bruto.serve === false && motivo) return { serve: false, motivo, viu };
    return { serve: true, viu };
  }
}
