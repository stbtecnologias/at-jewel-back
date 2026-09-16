import type { ImagemDeEntrada } from './tratamento-imagem.port';

/**
 * A DIRECAO DE ARTE DO CATALOGO, LIDA DAS OBSERVACOES E DAS PAGINAS.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE — 15/09/2026.
 *
 * O Lucas: "da a sensacao de que as fotos que envia, o catalogo que envia,
 * nao serve de nada para criar o novo catalogo. Nem observacoes, nem nada."
 *
 * A sensacao estava certa. As referencias do tipo IMAGEM — as paginas do
 * catalogo anterior — eram gravadas e NUNCA lidas por ninguem.
 *
 * ==========================================================================
 * 16/09/2026: O TEMA E DO CATALOGO, E NAO DO FUNDO DA JOIA.
 *
 * A primeira versao (15/09) lia as paginas e devolvia uma frase de estilo que
 * descia para o prompt da FOTO — e "tema praiano" virava fundo bege atras do
 * anel. O Lucas corrigiu: "nao e a imagem da joia que vai ficar com fundo, mas
 * o catalogo em si, com elementos praianos, as joias montadas com modelos".
 *
 * Por isso a leitura agora devolve CAMPOS, e quem usa e a MONTAGEM: a cena
 * vira arte de capa, fundo de pagina e a foto com modelo; a paleta pinta a
 * pagina. O packshot volta a ser branco.
 * ==========================================================================
 *
 * EM TEXTO, E NAO EM IMAGEM — e isso nao e preferencia, e cicatriz. Em
 * 31/08/2026 as paginas foram junto para o `/images/edits` e o modelo recortou
 * um brinco de DENTRO de uma delas. O estilo viaja como PALAVRA.
 */

export interface PaletaDoCatalogo {
  /** Cor dominante da pagina, clara o bastante para texto escuro. `#RRGGBB`. */
  fundo: string;
  /** Cor de detalhe: filete, faixa. `#RRGGBB`. */
  destaque: string;
  /** Cor de titulo. `#RRGGBB`. */
  texto: string;
}

/**
 * As cores do catalogo da casa: branco, filete dourado, titulo quase preto.
 * E a paleta quando a leitura falha ou devolve cor que nao e cor.
 */
export const PALETA_DA_CASA: PaletaDoCatalogo = {
  fundo: '#ffffff',
  destaque: '#b8912f',
  texto: '#1a1a1a',
};

/** Quem usa a peça quando o tema não diz — o público da casa. */
export const QUEM_USA_PADRAO = 'uma mulher elegante';

export interface DirecaoDeArte {
  /**
   * O cenario e o clima, em poucas frases: "praia ao fim da tarde, areia
   * clara, conchas, luz dourada". E o que desce para toda imagem gerada.
   */
  cena: string;
  /**
   * Quem aparece usando a peça: "mulher jovem", "homem de uns 40 anos",
   * "mãe e filha". O tema decide — Dia dos Pais não é uma modelo de biquíni.
   */
  modelo: string;
  paleta: PaletaDoCatalogo;
  /**
   * Frase curta de capa ("Dias de sol"), ou `null`. NUNCA preco: o cliente
   * HTTP descarta frase com `R$`.
   */
  frase: string | null;
}

export interface IEstiloCatalogo {
  /** Sem chave configurada, nao ha leitura. */
  disponivel(): boolean;

  /**
   * Le as observacoes (e as paginas, quando houver) e devolve a direcao de
   * arte — ou `null` quando o provedor falhou.
   *
   * `null` e "nao sei", e nao "nao tem tema": quem chama monta a direcao so
   * com o texto das observacoes.
   *
   * @param paginas as referencias do tipo IMAGEM, ja carregadas. Pode vir vazio.
   * @param observacoes o que o marketing escreveu. Nunca vazio — sem
   *   observacao nao ha tema, e ninguem chama isto.
   */
  ler(
    paginas: ImagemDeEntrada[],
    observacoes: string,
  ): Promise<DirecaoDeArte | null>;
}
