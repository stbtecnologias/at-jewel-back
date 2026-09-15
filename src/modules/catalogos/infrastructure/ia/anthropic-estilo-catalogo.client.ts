import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IEstiloCatalogo } from '../../domain/ports/estilo-catalogo.port';
import type { ImagemDeEntrada } from '../../domain/ports/tratamento-imagem.port';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

/**
 * Descrever estilo de pagina e leitura direta, nao raciocinio. O mesmo modelo
 * da conferencia da foto, pelo mesmo motivo.
 */
const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

const TIMEOUT_MS = 30_000;

/** A resposta e uma frase. O teto existe para o modelo nao escrever um ensaio. */
const MAX_TOKENS = 300;

/**
 * TETO DE PAGINAS POR LEITURA.
 *
 * Um catalogo de referencia tem dezenas de paginas, e todas dizem a mesma
 * coisa sobre estilo — a partir da terceira, paga-se para confirmar o que ja
 * se sabe. Capa e duas paginas internas bastam.
 */
const MAX_PAGINAS = 3;

/**
 * O QUE SE PEDE — e o cuidado esta em pedir POUCO.
 *
 * Nao se pede "descreva o catalogo": pede-se fundo, cores, luz e tipografia,
 * que sao as quatro coisas que quem monta a pagina consegue usar. Descricao
 * livre viraria paragrafo bonito e inutil.
 *
 * E SE PEDE O QUE NAO FAZER TAMBEM: sem isso o modelo descreve as JOIAS das
 * paginas ("aneis de ouro com esmeralda"), e essa descricao desceria para o
 * prompt da foto — que e exatamente onde ela faria estrago, sugerindo peca que
 * nao e a que foi fotografada.
 */
const PERGUNTA =
  'Estas são páginas de um catálogo de joias que serve de REFERÊNCIA DE ' +
  'ESTILO para montar um catálogo novo.\n\n' +
  'Descreva em até 3 frases curtas, em português, apenas:\n' +
  '1. a cor e o tipo do fundo das páginas (liso, gradiente, textura, papel);\n' +
  '2. a paleta — cor de título, de texto e de detalhe;\n' +
  '3. o clima da luz (quente, fria, natural, estúdio) e o estilo da ' +
  'tipografia (serifada, sem serifa, manuscrita, caixa alta).\n\n' +
  'NÃO descreva as joias que aparecem. NÃO invente nome de fonte. ' +
  'NÃO escreva preço, texto promocional nem título de coleção. ' +
  'Se as páginas não deixarem algo claro, omita esse item em vez de supor.';

/**
 * A leitura do estilo pelo Claude.
 *
 * HTTP direto, sem SDK — mesmo caminho do tratamento, da transcricao e da
 * conferencia.
 *
 * O QUE SAI DAQUI: as paginas de referencia e o que o marketing escreveu.
 * Nenhum dado de cliente, nenhum preco, nada do ERP.
 */
@Injectable()
export class AnthropicEstiloCatalogoClient implements IEstiloCatalogo {
  private readonly logger = new Logger(AnthropicEstiloCatalogoClient.name);

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  async ler(
    paginas: ImagemDeEntrada[],
    textos: string | null,
  ): Promise<string | null> {
    const chave = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!chave || paginas.length === 0) return null;

    const conteudo: unknown[] = paginas.slice(0, MAX_PAGINAS).map((p) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: p.mime,
        data: p.conteudo.toString('base64'),
      },
    }));
    conteudo.push({
      type: 'text',
      text: textos?.trim()
        ? `${PERGUNTA}\n\nO marketing escreveu sobre esta coleção: ${textos.trim()}`
        : PERGUNTA,
    });

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
            this.config.get<string>('ANTHROPIC_MODEL_ESTILO') ?? MODELO_PADRAO,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: conteudo }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        const corpo = await resp.text();
        this.logger.warn(
          `Anthropic /messages ${resp.status} na leitura de estilo: ${corpo.slice(0, 200)}`,
        );
        return null;
      }

      const dados = (await resp.json()) as {
        content?: { type?: string; text?: string }[];
      };
      const texto = dados.content?.find((c) => c.type === 'text')?.text?.trim();
      return texto || null;
    } catch (e) {
      this.logger.warn(
        `Leitura de estilo nao concluida: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
