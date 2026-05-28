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
 * Sanitiza recursivamente todas as strings de um objeto JSON arbitrario.
 * Usado em campos como `wishlist` que aceitam estrutura livre.
 *
 * Preserva chaves, numeros, booleans, null. Limita profundidade para evitar
 * estouro de stack em payload malicioso.
 */
const MAX_DEPTH = 8;

function sanitizarJson(valor: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return valor;
  if (typeof valor === 'string') return limparTextoXss(valor);
  if (Array.isArray(valor)) {
    return valor.map((item) => sanitizarJson(item, depth + 1));
  }
  if (valor != null && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) {
      out[k] = sanitizarJson(v, depth + 1);
    }
    return out;
  }
  return valor;
}

export function SanitizeJson(): PropertyDecorator {
  return Transform(({ value }) => sanitizarJson(value));
}
