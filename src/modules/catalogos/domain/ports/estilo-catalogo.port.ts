import type { ImagemDeEntrada } from './tratamento-imagem.port';

/**
 * O ESTILO DO CATALOGO, LIDO DAS PAGINAS QUE O MARKETING ENVIOU.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE — 15/09/2026.
 *
 * O Lucas: "da a sensacao de que as fotos que envia, o catalogo que envia,
 * nao serve de nada para criar o novo catalogo. Nem observacoes, nem nada."
 *
 * A sensacao estava certa. As referencias do tipo IMAGEM — as paginas do
 * catalogo anterior — eram gravadas e NUNCA lidas por ninguem. Os textos
 * (fonte, composicao, observacao) chegavam so ao prompt da foto, e ali
 * perdiam para a ordem fixa de fundo branco.
 *
 * Agora as paginas sao OLHADAS, e viram uma descricao curta em texto: clima,
 * cores, luz, tipografia. E essa descricao que desce para o tratamento da
 * foto e, depois, para a montagem do PDF.
 * ==========================================================================
 *
 * EM TEXTO, E NAO EM IMAGEM — e isso nao e preferencia, e cicatriz. Em
 * 31/08/2026 as paginas foram junto para o `/images/edits` e o modelo recortou
 * um brinco de DENTRO de uma delas, devolvendo-o no lugar da peca enviada. Ver
 * o cabecalho de `PedidoDeTratamento.original`. O estilo viaja como PALAVRA;
 * a unica imagem que entra na geracao continua sendo a foto da peca.
 */

export interface IEstiloCatalogo {
  /** Sem chave configurada, nao ha leitura e o catalogo segue sem estilo. */
  disponivel(): boolean;

  /**
   * Le as paginas e devolve o estilo em uma frase — ou `null` quando nao deu
   * para ler (sem paginas, timeout, cota, provedor fora do ar).
   *
   * `null` e "nao sei", e nao "nao tem estilo": quem chama segue com os
   * textos das referencias, como antes.
   *
   * @param paginas as referencias do tipo IMAGEM, ja carregadas.
   * @param textos o que o marketing escreveu (composicao, observacao), para o
   *   modelo casar o que LE com o que VE — "cores quentes" escrito e uma
   *   pagina bege confirmam um ao outro.
   */
  ler(
    paginas: ImagemDeEntrada[],
    textos: string | null,
  ): Promise<string | null>;
}
