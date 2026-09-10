/**
 * Recompoe a URL do arquivo sobre o host que NOS alcancamos.
 *
 * O WAHA devolve `http://waha:3000/api/files/...` — hostname da rede Docker
 * dele, que daqui nao resolve. Ficamos so com o caminho.
 *
 * ==========================================================================
 * O CAMINHO E CONFERIDO, E ESSA E A RAZAO DESTE ARQUIVO EXISTIR SOZINHO.
 *
 * A `url` chega de um payload externo. Mesmo com o webhook protegido por
 * token, aceitar qualquer caminho faria a gente buscar o que mandassem, com a
 * nossa `X-Api-Key` no cabecalho — um SSRF de mao beijada. Aceitar so
 * `/api/files/` custa uma linha e fecha isso.
 *
 * Vive num modulo proprio porque DOIS chamadores dependem dele: o
 * `WahaGateway` (midia que chega pelo webhook) e o `WahaAdminClient` (midia
 * de uma conversa aberta no painel). Duas copias da mesma checagem viram, com
 * o tempo, uma copia corrigida e uma esquecida.
 * ==========================================================================
 *
 * @returns a URL a usar, ou `null` se o caminho nao for de arquivo do WAHA.
 */
export function montarUrlDeArquivo(
  baseUrl: string,
  url: string,
): string | null {
  let caminho: string;
  try {
    const u = new URL(url);
    caminho = u.pathname + u.search;
  } catch {
    // Veio caminho relativo em vez de URL completa — tambem serve.
    caminho = url.startsWith('/') ? url : `/${url}`;
  }

  if (!caminho.startsWith('/api/files/')) return null;
  return `${baseUrl.replace(/\/$/, '')}${caminho}`;
}
