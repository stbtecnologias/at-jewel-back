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

/**
 * ORGANIZACAO POR CATALOGO.
 *
 *   catalogo/0331/referencias/uuid.jpg
 *   catalogo/0331/fotos/uuid.jpg
 *   catalogo/0331/finais/uuid.jpg
 *   catalogo/pendentes/uuid.jpg          <- ver abaixo
 *
 * Usa o NUMERO VISIVEL ('0331'), o mesmo que a vendedora digita no WhatsApp, e
 * nao o UUID: o bucket fica legivel por gente, da para ver tudo de um catalogo
 * de uma vez e apagar tudo junto quando ele morrer.
 */
export function pastaDoCatalogo(numero: string, pasta: string): string {
  return `catalogo/${numero}/${pasta}`;
}

/**
 * A AREA DE ESPERA, e por que ela precisa existir.
 *
 * A foto que chega pelo WhatsApp e gravada ANTES de se saber a que catalogo
 * pertence — a vendedora manda a imagem e so depois responde de qual catalogo
 * e. Gravar primeiro e deliberado: a alternativa e segurar o arquivo em memoria
 * enquanto se pergunta, e perde-lo se o processo reiniciar.
 *
 * Entao ela nasce aqui e e MOVIDA quando o catalogo aparece.
 */
export const PASTA_PENDENTES = 'catalogo/pendentes';

/** Teto por arquivo. Packshot de joia em 1600px fica bem abaixo disso. */
export const LIMITE_BYTES = 12 * 1024 * 1024;

export const MIMES_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface IArmazenamento {
  /** Grava e devolve a CHAVE. Quem chama guarda a chave, e so ela. */
  guardar(arquivo: ArquivoParaGuardar, pasta: string): Promise<string>;

  /** Remove pela chave. Silencioso se o arquivo ja nao existir. */
  remover(chave: string): Promise<void>;

  /**
   * Muda o arquivo de pasta, preservando o nome. Devolve a CHAVE NOVA.
   *
   * Existe por causa da area de espera: a foto do WhatsApp nasce em
   * `catalogo/pendentes/` e so depois se sabe o catalogo dela.
   *
   * No S3 isso e `CopyObject` + `DeleteObject` — a copia e SERVER-SIDE, o
   * arquivo nao desce nem sobe de novo. No disco e um `rename`.
   *
   * Se o arquivo de origem nao existir, devolve a chave ORIGINAL sem erro:
   * quem chama ja tem a linha no banco, e falhar aqui a deixaria apontando
   * para lugar nenhum.
   */
  mover(chave: string, novaPasta: string): Promise<string>;

  /**
   * Caminho relativo para o navegador montar `<img src>`. Relativo de
   * proposito: quem sabe o endereco da API e o front, nao o back.
   */
  caminhoPublico(chave: string): string;
}
