// Valores que o banco valida por CHECK (migracao 42). Ficam em TEXT, e nao em
// ENUM nativo, para evoluir sem ALTER TYPE — o mesmo criterio das demandas.

export const STATUS_CATALOGO = [
  'RASCUNHO',
  'COLETANDO',
  'PUBLICADO',
  'ENCERRADO',
] as const;
export type StatusCatalogo = (typeof STATUS_CATALOGO)[number];

/** Proporcao da PECA FINAL. Nao vale para as fotos, que sao packshot quadrado. */
export const FORMATOS_CATALOGO = ['9:16', '16:9'] as const;
export type FormatoCatalogo = (typeof FORMATOS_CATALOGO)[number];

export const TIPOS_REFERENCIA = [
  'IMAGEM',
  'FONTE',
  'COMPOSICAO',
  'OBSERVACAO',
] as const;
export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number];

export const ORIGENS_FOTO = ['WHATSAPP', 'UPLOAD'] as const;
export type OrigemFoto = (typeof ORIGENS_FOTO)[number];

export const STATUS_FOTO = [
  'RECEBIDA',
  'NAO_CLASSIFICADA',
  'PROCESSANDO',
  'EM_APROVACAO',
  'APROVADA',
  'REPROVADA',
] as const;
export type StatusFoto = (typeof STATUS_FOTO)[number];

export const ORIGENS_FINAL = ['IA', 'MARKETING'] as const;
export type OrigemFinal = (typeof ORIGENS_FINAL)[number];

/**
 * Somente catalogos COLETANDO entram na lista que a agente do WhatsApp
 * consulta. Rascunho e proposito, nao encomenda: oferecer um catalogo que
 * ninguem liberou faria a foto cair numa colecao que talvez nem exista.
 */
export const STATUS_ABERTO: StatusCatalogo = 'COLETANDO';
