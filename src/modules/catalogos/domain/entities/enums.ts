// Valores que o banco valida por CHECK (migracao 42). Ficam em TEXT, e nao em
// ENUM nativo, para evoluir sem ALTER TYPE — o mesmo criterio das demandas.

export const STATUS_CATALOGO = [
  'RASCUNHO',
  'COLETANDO',
  'PUBLICADO',
  'ENCERRADO',
  /**
   * EXCLUIDO — a exclusao que nao apaga, 22/10/2026.
   *
   * ========================================================================
   * DECISAO DO LUCAS: *"ainda acho melhor nao apagar diretamente; podemos
   * colocar excluir, mas internamente tratamos como desativada, onde elas
   * nao tem acesso"*.
   *
   * E A RAZAO DE SER UM STATUS, e nao uma coluna `excluido_em`: o unico
   * portao do WhatsApp para os catalogos e o `listarAbertos`, que filtra
   * `status = 'COLETANDO'`. Sendo status, o excluido some das SEIS chamadas
   * da agente POR CONSTRUCAO — nao ha um `AND excluido_em IS NULL` novo
   * para alguem esquecer na setima.
   *
   * No painel ele sai da lista por padrao, e so aparece a quem FILTRAR por
   * ele — que e como se restaura. Exclusao que ninguem consegue desfazer e
   * um apagao com outro nome.
   * ========================================================================
   */
  'EXCLUIDO',
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
