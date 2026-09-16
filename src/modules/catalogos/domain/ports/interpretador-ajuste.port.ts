/**
 * QUEM TRADUZ O PEDIDO DE AJUSTE EM AÇÕES — 16/09/2026.
 *
 * "Na página 4 a modelo sorrindo, tira o colar de turquesa" vira uma lista de
 * ações da lista fechada de `ajustes-do-catalogo.ts`.
 *
 * A PORTA DEVOLVE O JSON CRU, e não ações prontas: quem confere é a
 * aplicação, contra o plano da versão que a pessoa viu. O provedor so
 * interpreta — nunca decide o que vale.
 */
export interface IInterpretadorDeAjuste {
  disponivel(): boolean;

  /**
   * @param resumo o PDF em texto, página por página (sem preço).
   * @param pedido o que a pessoa escreveu.
   * @returns o objeto que o modelo devolveu, ou `null` quando falhou.
   */
  interpretar(resumo: string, pedido: string): Promise<unknown>;
}
