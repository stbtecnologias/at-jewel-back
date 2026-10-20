/**
 * PARA ONDE VAI A FOTO QUE ESTÁ ESPERANDO — 20/10/2026.
 *
 * ==========================================================================
 * POR QUE DEDUZIR, E NÃO EXIGIR A PALAVRA CERTA.
 *
 * A primeira versão disto era vocabulário fixo: "peça", "produto", o código.
 * O Lucas cortou na hora — *"não vamos deixar essa coisa padrão de peça,
 * produto; você tem que deduzir pelo que ela falar"*.
 *
 * Ele está certo, e o argumento é estrutural: num canal que tem modelo, fazer
 * a pessoa aprender palavra mágica é inverter quem se adapta a quem. Ela
 * responde "é daquele brinco que você me mostrou", "manda pro under 25",
 * "catálogo", "do BR26396" — e todas são a mesma pergunta respondida.
 * ==========================================================================
 *
 * A ESCOLHA É DE UM CONJUNTO FECHADO: os catálogos abertos mais, quando
 * houver, a peça de que se estava falando. O modelo não inventa destino — ele
 * escolhe um dos que existem, ou diz que não entendeu.
 *
 * E A PORTA DEVOLVE O JSON CRU, como a do ajuste: quem valida é a aplicação.
 * O provedor interpreta; nunca decide o que vale.
 */
export interface OpcoesDeDestino {
  catalogos: { numero: string; nome: string }[];
  /** A peça de que se falou agora, quando houve uma. */
  peca: { codigo: string; descricao: string | null } | null;
}

export interface IInterpretadorDeDestino {
  disponivel(): boolean;

  /**
   * @param texto o que ela respondeu, em texto livre.
   * @param opcoes os destinos que de fato existem.
   * @returns o objeto que o modelo devolveu, ou `null` quando falhou.
   */
  interpretar(texto: string, opcoes: OpcoesDeDestino): Promise<unknown>;
}
