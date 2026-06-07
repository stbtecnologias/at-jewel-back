import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

/**
 * Configuracao restritiva: remove TODAS as tags HTML, atributos e event
 * handlers, preservando apenas o texto plano. Decode-on-load do navegador
 * fica neutralizado para esse texto.
 *
 * Uso:
 *   @IsString()
 *   @MaxLength(255)
 *   @SanitizeText()
 *   nome: string;
 */
const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard', // mantem o texto interno, descarta a tag
  allowProtocolRelative: false,
};

export function limparTextoXss(valor: string): string {
  return sanitizeHtml(valor, SANITIZE_OPTS);
}

/**
 * Higiene conservadora de texto livre em tempo de ESCRITA. Complementa
 * (NAO substitui) o sanitizer XSS. Foco: neutralizar truques de ofuscacao
 * usados em prompt injection indireta, sem corromper conteudo legitimo da
 * cliente.
 *
 * IMPORTANTE: a defesa principal contra injecao indireta e em tempo de
 * LEITURA (delimitar o campo ao reinjetar no LLM). Esta funcao NAO tenta
 * detectar nem remover frases de injecao -- apenas higiene de caracteres.
 *
 * O que faz:
 *  - Normaliza Unicode para NFC (mitiga homoglifos/decomposicao usados para
 *    contrabandear instrucoes que so "remontam" depois).
 *  - Normaliza \r\n e \r isolado para \n.
 *  - Remove caracteres de controle invisiveis C0 (U+0000..U+001F) e C1
 *    (U+007F..U+009F). EXCECAO: preserva \n (U+000A) e \t (U+0009), que sao
 *    formatacao legitima de texto livre.
 *  - Remove zero-width e caracteres invisiveis comumente usados para ofuscar:
 *    soft hyphen (U+00AD), ZWSP (U+200B), ZWNJ (U+200C), ZWJ (U+200D),
 *    LRM/RLM (U+200E, U+200F), embeddings/overrides bidi (U+202A..U+202E),
 *    word joiner (U+2060), isolates bidi (U+2066..U+2069) e BOM/ZWNBSP
 *    (U+FEFF).
 *  - Colapsa runs absurdos (4+) de espacos/tabs horizontais em um unico
 *    espaco (conservador: nao mexe em quebras de linha nem em runs curtos).
 *
 * O que NAO faz: nao remove pontuacao, nao remove palavras, nao remove
 * emojis legitimos, nao detecta frases.
 */

function intervalo(de: number, ate: number): number[] {
  const out: number[] = [];
  for (let cp = de; cp <= ate; cp++) out.push(cp);
  return out;
}

function classeDeCodepoints(cps: number[]): RegExp {
  const cls = cps.map((cp) => String.fromCodePoint(cp)).join('');
  return new RegExp('[' + cls + ']', 'g');
}

// Codepoints construidos numericamente (fonte 100% ASCII) para garantir que
// nao existam caracteres de controle/invisiveis literais no arquivo.
//
// Controle: C0 (U+0000..U+001F) exceto \t (U+0009) e \n (U+000A); DEL
// (U+007F); bloco C1 (U+0080..U+009F).
const CONTROL_CHARS = classeDeCodepoints([
  ...intervalo(0x00, 0x1f).filter((cp) => cp !== 0x09 && cp !== 0x0a),
  ...intervalo(0x7f, 0x9f),
]);

// Invisiveis usados para ofuscar/contrabandear instrucoes.
const INVISIVEIS = classeDeCodepoints([
  0x00ad, // soft hyphen
  ...intervalo(0x200b, 0x200f), // ZWSP, ZWNJ, ZWJ, LRM, RLM
  ...intervalo(0x202a, 0x202e), // embeddings/overrides bidi
  0x2060, // word joiner
  ...intervalo(0x2066, 0x2069), // isolates bidi
  0xfeff, // BOM / ZWNBSP
]);

const RUN_ESPACOS_HORIZONTAIS = /[ \t]{4,}/g;

export function higienizarTextoLivre(valor: string): string {
  // 1. NFC primeiro: remonta sequencias decompostas antes de filtrar.
  let out = valor.normalize('NFC');
  // 2. Normaliza quebras de linha (\r\n e \r isolado viram \n).
  out = out.replace(/\r\n?/g, '\n');
  // 3. Remove caracteres de controle invisiveis (preserva \n e \t).
  out = out.replace(CONTROL_CHARS, '');
  // 4. Remove zero-width / bidi / soft-hyphen.
  out = out.replace(INVISIVEIS, '');
  // 5. Colapsa runs absurdos de espacos horizontais.
  out = out.replace(RUN_ESPACOS_HORIZONTAIS, ' ');
  return out;
}

/**
 * Aplica XSS sanitizer + higiene de texto livre, nesta ordem.
 * O sanitize-html roda primeiro (remocao de tags e decode controlado de
 * entidades); a higiene roda depois sobre o texto plano resultante, de modo
 * que zero-width contrabandeados dentro de tags ja foram descartados e o que
 * sobra de texto plano passa pela limpeza de caracteres.
 */
export function limparEHigienizar(valor: string): string {
  return higienizarTextoLivre(limparTextoXss(valor));
}

/**
 * Sanitiza texto plano. Usar em campos de texto livre que serao renderizados
 * por algum cliente (CRM dashboard, Chatwoot).
 *
 * Em arrays: sanitiza cada string. Em outros tipos (number, bool, null): passa.
 */
export function SanitizeText(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value === 'string') return limparTextoXss(value);
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'string' ? limparTextoXss(v) : v));
    }
    return value;
  });
}

/**
 * Combina XSS sanitizer + higiene de texto livre num unico Transform, para
 * campos de texto livre que sao relidos no contexto de LLMs (intencaoCompra,
 * notasInternas, resumoTriagem, tags). Garante que ambas as etapas rodem na
 * ordem correta independentemente da ordem de declaracao de decorators.
 *
 * Em arrays: aplica a cada string. Em outros tipos: passa.
 */
export function HigienizarTextoLivre(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value === 'string') return limparEHigienizar(value);
    if (Array.isArray(value)) {
      return value.map((v) =>
        typeof v === 'string' ? limparEHigienizar(v) : v,
      );
    }
    return value;
  });
}

/**
 * Sanitiza recursivamente todas as strings de um objeto JSON arbitrario.
 * Usado em campos como `wishlist` que aceitam estrutura livre.
 *
 * Preserva chaves, numeros, booleans, null. Limita profundidade para evitar
 * estouro de stack em payload malicioso.
 *
 * Por padrao aplica apenas o XSS sanitizer. Quando `comHigiene` e true,
 * aplica tambem a higiene de texto livre em cada string (usado em campos
 * relidos por LLM, como `wishlist`).
 */
const MAX_DEPTH = 8;

function sanitizarJson(
  valor: unknown,
  comHigiene: boolean,
  depth = 0,
): unknown {
  if (depth >= MAX_DEPTH) return valor;
  if (typeof valor === 'string') {
    return comHigiene ? limparEHigienizar(valor) : limparTextoXss(valor);
  }
  if (Array.isArray(valor)) {
    return valor.map((item) => sanitizarJson(item, comHigiene, depth + 1));
  }
  if (valor != null && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) {
      out[k] = sanitizarJson(v, comHigiene, depth + 1);
    }
    return out;
  }
  return valor;
}

/**
 * Sanitiza JSON aplicando o XSS sanitizer em cada string. Quando `comHigiene`
 * e true, aplica tambem a higiene de texto livre (para campos relidos por LLM).
 */
export function SanitizeJson(comHigiene = false): PropertyDecorator {
  return Transform(({ value }) => sanitizarJson(value, comHigiene));
}
