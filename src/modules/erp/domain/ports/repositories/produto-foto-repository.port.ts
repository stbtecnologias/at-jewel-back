/**
 * AS FOTOS DA PECA — RF33, 20/10/2026.
 *
 * A peca tinha um lugar para imagem e passou a ter varios. A `capa` e a que
 * ganha da foto do ERP: e ela que vai na lista, no catalogo e na resposta da
 * agente.
 */
export interface FotoDaPeca {
  id: string;
  produtoId: string;
  /** Chave no armazenamento. A MESMA pode servir a varias pecas — ver RF34. */
  arquivoId: string;
  mime: string;
  bytes: number;
  capa: boolean;
  posicao: number;
  origem: 'PAINEL' | 'WHATSAPP';
  enviadoPor: string | null;
  criadoEm: Date;
}

export interface NovaFotoDaPeca {
  produtoId: string;
  arquivoId: string;
  mime: string;
  bytes: number;
  origem: 'PAINEL' | 'WHATSAPP';
  enviadoPor: string | null;
}

export interface IProdutoFotoRepository {
  /** As fotos da peca, capa primeiro. */
  listar(produtoId: string): Promise<FotoDaPeca[]>;

  buscarPorId(id: string): Promise<FotoDaPeca | null>;

  /**
   * Grava a foto. A PRIMEIRA DA PECA NASCE CAPA — ninguem precisa escolher
   * capa para ter capa, e peca com foto e sem capa seria peca sem imagem na
   * lista.
   *
   * A posicao sai do fim da fila, na mesma consulta — sem isso, duas fotos
   * chegando juntas pelo WhatsApp ganhariam a mesma.
   */
  adicionar(nova: NovaFotoDaPeca): Promise<FotoDaPeca>;

  /**
   * Troca a capa: desmarca a atual e marca esta, NA MESMA TRANSACAO.
   *
   * Em duas transacoes o indice parcial `idx_produto_fotos_uma_capa` recusaria
   * a segunda — e e bom que recuse: a regra e do banco, nao do servico.
   */
  definirCapa(produtoId: string, fotoId: string): Promise<void>;

  /**
   * Remove a linha e devolve se o ARQUIVO ainda e usado por outra peca.
   *
   * Quem chama so apaga o arquivo do armazenamento quando vier `false` —
   * apagar antes de conferir deixaria a outra peca com uma linha apontando
   * para um arquivo que ja nao existe.
   */
  remover(id: string): Promise<{ arquivoId: string; aindaUsado: boolean } | null>;

  /** Quantas a peca ja tem. Para o teto por peca. */
  contar(produtoId: string): Promise<number>;

  /** A capa de cada peca da lista, para a listagem nao fazer N consultas. */
  capasDe(produtoIds: string[]): Promise<Map<string, string>>;
}
