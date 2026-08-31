/**
 * Tratamento da foto da peca pela IA.
 *
 * ==========================================================================
 * O QUE A IA PODE MUDAR — E O QUE ELA NAO PODE, EM NENHUMA HIPOTESE.
 *
 * Pode: fundo, iluminacao, sombra, enquadramento, proporcao, nitidez.
 * NAO pode: a JOIA. Numero de pedras, formato, cor do metal, proporcao entre
 * as partes. Um modelo de imagem "melhora" o que ve se ninguem o proibir — e
 * o resultado seria um catalogo mostrando peca que a loja nao vende.
 *
 * Isto nao e recomendacao: e a primeira regra do prompt, e esta aqui na porta
 * porque vale para qualquer provedor que venha a implementa-la.
 * ==========================================================================
 */

export interface ImagemDeEntrada {
  conteudo: Buffer;
  mime: string;
}

export interface PedidoDeTratamento {
  /** A foto como saiu do celular. */
  original: ImagemDeEntrada;

  /**
   * As referencias de IMAGEM do catalogo — as paginas anteriores que definem
   * o padrao. Sao o que faz a peca nova parecer da mesma colecao.
   */
  referencias: ImagemDeEntrada[];

  /**
   * O padrao escrito do catalogo, montado a partir das referencias de texto
   * (FONTE, COMPOSICAO, OBSERVACAO).
   */
  padrao: string | null;

  /**
   * O que a pessoa pediu na legenda, em texto livre: "fundo rosa", "mais
   * claro". Entra DEPOIS do padrao do catalogo, entao um pedido pontual
   * prevalece sobre a regra geral.
   */
  pedidoDaPessoa: string | null;

  /** Proporcao final: 9:16 para story, 16:9 para apresentacao. */
  formato: '9:16' | '16:9';
}

export interface ImagemTratada {
  conteudo: Buffer;
  mime: string;
}

export interface ITratamentoImagem {
  /**
   * Devolve a peca tratada, ou `null` quando o provedor falha.
   *
   * `null` e nao excecao: quem chama ja gravou o original e ja respondeu a
   * pessoa. O tratamento e uma etapa a mais sobre um arquivo que ja e nosso —
   * falhar aqui custa uma versao, nunca a foto.
   */
  tratar(pedido: PedidoDeTratamento): Promise<ImagemTratada | null>;
}
