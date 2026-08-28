/**
 * Armazenamento de arquivo do catalogo — referencias criativas, fotos das
 * pecas e a peca final.
 *
 * ==========================================================================
 * O QUE ATRAVESSA ESTA PORTA E UMA CHAVE, NUNCA UMA URL.
 *
 * O banco guarda `arquivo_id` (ex.: `referencias/9f3c….jpg`). Guardar URL
 * absoluta amarraria cada linha ao host de hoje: mudar de dominio, de porta ou
 * de disco para S3 exigiria reescrever a base. Com a chave, a troca de
 * adaptador nao toca em nenhuma linha ja gravada.
 * ==========================================================================
 */

export interface ArquivoParaGuardar {
  conteudo: Buffer;
  /** MIME informado pelo upload. Validado por quem chama, nao aqui. */
  mime: string;
  /** Nome original, usado so para derivar a extensao. */
  nomeOriginal: string;
}

/** Pastas logicas dentro do armazenamento. */
export const PASTA_REFERENCIAS = 'referencias';
export const PASTA_FOTOS = 'fotos';
export const PASTA_FINAIS = 'finais';

/** Teto por arquivo. Packshot de joia em 1600px fica bem abaixo disso. */
export const LIMITE_BYTES = 12 * 1024 * 1024;

export const MIMES_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface IArmazenamento {
  /** Grava e devolve a CHAVE. Quem chama guarda a chave, e so ela. */
  guardar(arquivo: ArquivoParaGuardar, pasta: string): Promise<string>;

  /** Remove pela chave. Silencioso se o arquivo ja nao existir. */
  remover(chave: string): Promise<void>;

  /**
   * Caminho relativo para o navegador montar `<img src>`. Relativo de
   * proposito: quem sabe o endereco da API e o front, nao o back.
   */
  caminhoPublico(chave: string): string;
}
