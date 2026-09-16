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
/** A foto tratada pela IA — e a que vai para o catalogo. */
export const PASTA_FOTOS = 'fotos';

/**
 * A foto como saiu do celular. NUNCA e reescrita: reprovar precisa poder
 * gerar de novo a partir dela, e nao de cima de um tratamento anterior —
 * tratar o tratado degrada a imagem a cada rodada.
 */
export const PASTA_ORIGINAIS = 'originais';
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
 * A FOTO DE PRODUTO — que nao pertence a catalogo nenhum.
 *
 *   produtos/CO26185/uuid.jpg
 *
 * Mora fora de `catalogo/` de proposito: ela e da PECA, e a mesma peca aparece
 * em varios catalogos ao longo do tempo. Pendurar a foto no catalogo faria a
 * imagem morrer junto com a campanha.
 *
 * A pasta usa o CODIGO DO ERP, e nao o id interno, pela regra de sempre: o
 * codigo e a chave estavel da peca, e uma resync que recrie linhas orfanaria
 * tudo que estivesse preso ao id. De quebra, o bucket fica legivel — da para
 * achar a foto de uma peca sabendo so o codigo dela.
 *
 * O codigo e higienizado porque vai virar caminho: a base tem codigo com hifen
 * (`1-25-3A-2`), e nada garante que nao apareca um com barra ou espaco.
 */
/**
 * As fotos de uma OCORRENCIA — defeito, devolucao, reclamacao.
 *
 *   ocorrencias/<id>/uuid.jpg
 *
 * Por id, e nao por codigo de peca: a ocorrencia e do EPISODIO, nao da peca. A
 * mesma peca pode voltar tres vezes, e as fotos de cada volta contam historias
 * diferentes — misturar as tres numa pasta so faria a terceira parecer prova da
 * primeira.
 */
export function pastaDaOcorrencia(ocorrenciaId: string): string {
  return `ocorrencias/${ocorrenciaId}`;
}

export function pastaDaFotoDeProduto(codigoErp: string): string {
  const limpo = codigoErp
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '_');
  return `produtos/${limpo}`;
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

/**
 * O que uma REFERENCIA aceita — imagem mais PDF.
 *
 * Lista propria, e nao um item a mais em `MIMES_IMAGEM`, porque aquela e usada
 * tambem pela foto que chega do WhatsApp e pela foto de produto. Alargar la
 * deixaria um PDF entrar como packshot de peca, que e coisa que nao existe.
 *
 * O PDF cabe AQUI porque referencia visual nao vai para a IA — decidido em
 * 28/08/2026 e escrito no `tratar-foto.use-case.ts`: mandar as imagens de
 * referencia fez o modelo devolver uma joia recortada de dentro de uma delas.
 * Entao referencia e material de consulta de GENTE, e gente le PDF.
 */
export const MIMES_REFERENCIA = [...MIMES_IMAGEM, 'application/pdf'] as const;

/**
 * Teto de uma referencia em PDF — MUITO maior que o da imagem, e precisa ser.
 *
 * `LIMITE_BYTES` foi dimensionado para packshot de celular. Catalogo fechado em
 * PDF de grafica passa disso com folga.
 *
 * O NUMERO SAI DOS ARQUIVOS REAIS, medidos em 04/09/2026 nos catalogos que a
 * casa tem em maos:
 *
 *   FATHER'S DAY  18 MB    AT JEWEL           64 MB
 *   ESMERALDA     36 MB    NEW IN             78 MB
 *   A.T JEWEL     37 MB    A.T FINE JEWELRY   87 MB
 *   PIERCE        50 MB
 *
 * Um teto de 60 MB — que foi a primeira tentativa, por palpite — recusava
 * QUATRO DOS SETE. Fica igual ao `LIMITE_FINAL_BYTES`: e o mesmo tipo de
 * arquivo, um catalogo fechado, e aceitar 100 MB como peca final e 60 MB como
 * referencia nao teria explicacao.
 */
export const LIMITE_PDF_BYTES = 100 * 1024 * 1024;

export interface IArmazenamento {
  /** Grava e devolve a CHAVE. Quem chama guarda a chave, e so ela. */
  guardar(arquivo: ArquivoParaGuardar, pasta: string): Promise<string>;

  /**
   * Grava NUMA CHAVE ESCOLHIDA por quem chama — 16/09/2026.
   *
   * Existe para o que acompanha outro arquivo e tem de ser achado a partir
   * dele, sem coluna no banco: o plano da montagem mora em
   * `<chave do PDF>.plano.json`. Para tudo que vem de fora (upload, foto do
   * WhatsApp) continua valendo `guardar`, com UUID — nome escolhido so para
   * o que o proprio sistema gera.
   */
  guardarEm(chave: string, conteudo: Buffer, mime: string): Promise<void>;

  /**
   * Le o arquivo inteiro na memoria. Devolve null se nao existir.
   *
   * Existe porque o tratamento pela IA precisa MANDAR a imagem para outro
   * servico — nao basta servi-la ao navegador. O teto de 12 MB por arquivo
   * (LIMITE_BYTES) e o que torna seguro carregar assim.
   */
  ler(chave: string): Promise<{ conteudo: Buffer; mime: string } | null>;

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
