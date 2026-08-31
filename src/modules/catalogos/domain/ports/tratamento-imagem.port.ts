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
  /**
   * A foto como saiu do celular — E A UNICA IMAGEM QUE ENTRA.
   *
   * =========================================================================
   * AS PAGINAS DE REFERENCIA NAO VAO JUNTO, E ISSO CUSTOU CARO PARA APRENDER.
   *
   * Elas iam, ate 31/08/2026. O resultado do teste daquele dia: o modelo
   * recortou um brinco de turquesa e malaquita DE DENTRO de uma pagina de
   * referencia e o devolveu no lugar da peca enviada. Nao foi "embelezar" a
   * joia — foi TROCAR a joia por outra, de outra peca do catalogo antigo.
   *
   * A causa nao esta no texto do prompt, e sim no endpoint. `/v1/images/edits`
   * recebe varias `image[]` e o significado dele e "edite estas imagens
   * JUNTAS". Nao existe vaga de "esta e apenas referencia de estilo". O prompt
   * dizia uma coisa e a FORMA DA CHAMADA dizia outra — e a forma ganha.
   *
   * Entao o padrao visual entra so por TEXTO, em `padrao`. E suficiente: o
   * padrao da casa e "fundo branco liso, peca de frente, centralizada", que
   * cabe numa linha. Mandar a pagina junto acrescentava o risco de trocar a
   * joia sem acrescentar precisao nenhuma.
   *
   * NAO ACRESCENTE UM CAMPO DE IMAGEM AQUI enquanto o provedor nao tiver uma
   * entrada declaradamente de referencia, que o modelo nao possa editar.
   * =========================================================================
   */
  original: ImagemDeEntrada;

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
