import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QUEM_USA_PADRAO,
  PALETA_DA_CASA,
  type DirecaoDeArte,
  type IEstiloCatalogo,
} from '../../domain/ports/estilo-catalogo.port';
import type { ImagemDeEntrada } from '../../domain/ports/tratamento-imagem.port';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

/**
 * Traduzir observacao em direcao de arte e leitura direta, nao raciocinio. O
 * mesmo modelo da conferencia da foto, pelo mesmo motivo.
 */
const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

const TIMEOUT_MS = 30_000;

/** A resposta e um JSON pequeno. O teto existe para o modelo nao escrever um ensaio. */
const MAX_TOKENS = 400;

/**
 * TETO DE PAGINAS POR LEITURA.
 *
 * Um catalogo de referencia tem dezenas de paginas, e todas dizem a mesma
 * coisa sobre estilo — a partir da terceira, paga-se para confirmar o que ja
 * se sabe.
 */
const MAX_PAGINAS = 3;

const HEX = /^#[0-9a-f]{6}$/i;

/** A frase vai impressa na capa. Curta, ou nao vai. */
const MAX_FRASE = 60;

/**
 * O QUE SE PEDE — e o cuidado esta em pedir O QUE A MONTAGEM USA.
 *
 * Tres campos, cada um com dono: a CENA desce para as imagens geradas (capa,
 * fundo de pagina, foto com modelo), a PALETA pinta a pagina, a FRASE vai na
 * capa.
 *
 * E SE PEDE O QUE NAO FAZER: sem isso o modelo descreve as JOIAS das paginas
 * ("aneis de ouro com esmeralda"), e essa descricao desceria para a foto com
 * modelo — sugerindo peca que nao e a que foi fotografada.
 */
const PERGUNTA =
  'Você é diretor de arte de um catálogo de joias. A partir das observações ' +
  'do marketing (e das páginas de referência, se houver imagens), defina a ' +
  'direção de arte do catálogo NOVO.\n\n' +
  'Responda SOMENTE com um JSON, sem texto antes ou depois:\n' +
  '{"cena": "...", "modelo": "...", "paleta": {"fundo": "#RRGGBB", ' +
  '"destaque": "#RRGGBB", "texto": "#RRGGBB"}, "frase": "..."}\n\n' +
  '- cena: até 3 frases, em português, descrevendo cenário, elementos ' +
  'visuais e luz para as fotografias do catálogo;\n' +
  '- modelo: quem aparece usando as joias, coerente com o tema e o público ' +
  '(ex.: "uma mulher elegante", "um homem de uns 40 anos", "mãe e filha ' +
  'adulta");\n' +
  '- paleta.fundo: cor CLARA de página, onde texto escuro seja legível;\n' +
  '- paleta.destaque: cor de detalhe que combine com o tema;\n' +
  '- paleta.texto: cor ESCURA de título, legível sobre o fundo;\n' +
  '- frase: chamada curta de capa (até 6 palavras) ou null.\n\n' +
  'Exemplos de leitura (não copie, adapte ao que foi escrito):\n' +
  '- "tema praiano, férias" → praia ao fim da tarde, areia clara, conchas, ' +
  'luz dourada; uma mulher elegante; areia, turquesa;\n' +
  '- "outono" → folhas secas, madeira, tecidos quentes, luz baixa de fim de ' +
  'tarde; tons terracota, caramelo e verde-oliva;\n' +
  '- "primavera" → flores frescas, jardim, luz clara da manhã; tons rosados ' +
  'e verdes suaves;\n' +
  '- "dia dos pais" → escritório clássico ou couro e madeira, luz quente; um ' +
  'homem maduro, ou pai e filho;\n' +
  '- "dia das mães" → ambiente acolhedor, flores, luz suave; mãe e filha ' +
  'adulta, ou uma mulher madura;\n' +
  '- "natal" → mesa posta, luzes desfocadas, veludo, velas; vermelho ' +
  'profundo, verde-escuro e dourado (a página continua clara).\n\n' +
  'NÃO descreva joias. NÃO escreva preço, número de parcela nem valor. ' +
  'Siga as observações; as páginas só refinam cor e clima.';

/**
 * A leitura da direcao de arte pelo Claude.
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
    observacoes: string,
  ): Promise<DirecaoDeArte | null> {
    const chave = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!chave || !observacoes.trim()) return null;

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
      text: `${PERGUNTA}\n\nObservações do marketing: ${observacoes.trim()}`,
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
          `Anthropic /messages ${resp.status} na direcao de arte: ${corpo.slice(0, 200)}`,
        );
        return null;
      }

      const dados = (await resp.json()) as {
        content?: { type?: string; text?: string }[];
      };
      const texto = dados.content?.find((c) => c.type === 'text')?.text ?? '';
      return AnthropicEstiloCatalogoClient.interpretar(texto);
    } catch (e) {
      this.logger.warn(
        `Direcao de arte nao concluida: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * O JSON do modelo, CONFERIDO CAMPO A CAMPO.
   *
   * O que sai daqui vai direto para `fillColor` e para a capa impressa. Cor
   * fora do formato quebraria o PDF; frase com preco seria a IA escrevendo
   * dinheiro — justamente o que a montagem existe para impedir.
   *
   * Sem cena, nao ha direcao: devolve `null` e quem chama usa o texto das
   * observacoes. Cor invalida nao derruba o resto — cai na cor da casa.
   */
  static interpretar(texto: string): DirecaoDeArte | null {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio === -1 || fim <= inicio) return null;

    let bruto: {
      cena?: unknown;
      modelo?: unknown;
      paleta?: { fundo?: unknown; destaque?: unknown; texto?: unknown };
      frase?: unknown;
    };
    try {
      bruto = JSON.parse(texto.slice(inicio, fim + 1)) as typeof bruto;
    } catch {
      return null;
    }

    const cena = typeof bruto.cena === 'string' ? bruto.cena.trim() : '';
    if (!cena) return null;

    const cor = (v: unknown, padrao: string) =>
      typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : padrao;

    const fraseBruta =
      typeof bruto.frase === 'string' ? bruto.frase.trim() : '';
    const frase =
      fraseBruta &&
      fraseBruta.length <= MAX_FRASE &&
      !/r\$|\d+\s*x\b/i.test(fraseBruta)
        ? fraseBruta
        : null;

    const modelo =
      typeof bruto.modelo === 'string' && bruto.modelo.trim()
        ? bruto.modelo.trim()
        : QUEM_USA_PADRAO;

    return {
      cena,
      modelo,
      paleta: {
        fundo: cor(bruto.paleta?.fundo, PALETA_DA_CASA.fundo),
        destaque: cor(bruto.paleta?.destaque, PALETA_DA_CASA.destaque),
        texto: cor(bruto.paleta?.texto, PALETA_DA_CASA.texto),
      },
      frase,
    };
  }
}
