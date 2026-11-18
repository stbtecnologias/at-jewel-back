/**
 * A VENDA LIMPA, escrita uma vez só — 18/11/2026.
 *
 * ==========================================================================
 * "O MESMO VALOR SE FOR O MESMO PERÍODO."
 *
 * Em 18/11, às 10:24, duas ferramentas responderam a mesma pergunta com dois
 * números:
 *
 *   "Qual o VALOR das vendas desse mês?"  →  R$ 1.860.578,00
 *   "QUAIS as vendas desse mês?"          →  rodapé R$ 1.893.544,00
 *
 * Os dois estavam certos pela própria regra — um descontava a devolução do
 * período, o outro somava as linhas visíveis —, e é por isso que o defeito é
 * grave: ninguém consegue dizer qual mente olhando só a tela. A queixa do
 * Lucas foi direta: *"não adianta uma ferramenta falar um valor e outra
 * falar outra; todas as ferramentas que falam vendas e retornam valores têm
 * que estar alinhadas"*.
 *
 * A ESCOLHA FOI A VENDA, E NÃO O CAIXA. Medindo as 3 devoluções de novembro,
 * nenhuma era devolução de venda DO MÊS: uma abatia uma compra de 23/09, e
 * duas eram de clientes cuja venda no período aconteceu DEPOIS da devolução.
 * Descontá-las media quanto ENTROU no mês, e não quanto o mês VENDEU.
 *
 * Decisão: *"troca para as vendas limpas — R$ 1.893.544,00. Depois vamos
 * analisar como tratamos essas devoluções"*.
 *
 * ESTE ARQUIVO EXISTE PELO MOTIVO DO `movimentacao-como-venda`: a conta
 * estava repetida em quatro lugares, e regra repetida é regra que diverge na
 * primeira correção. Foi exatamente assim que as duas pontas se separaram.
 *
 * A TELA SEGUE NO LÍQUIDO, de propósito e por ora: o card se chama RECEITA,
 * e mexer nele é mexer no `receitaLiquida`, que alimenta também Analytics,
 * Metas e Fidelidade. É a conversa adiada.
 * ==========================================================================
 */

/** O que o `resumo` do repositório entrega. Só o que esta regra precisa. */
export interface ResumoComDevolucao {
  quantidade: number;
  /** Já líquida: saídas menos devoluções. */
  receita: number;
  valorDevolvido: number;
}

export interface VendaLimpa {
  quantidade: number;
  /** As vendas do período, SEM abater devolução. */
  valor: number;
  /** `valor` dividido pela quantidade. Zero quando não houve venda. */
  ticketMedio: number;
}

/**
 * O bruto volta pela soma — o repositório entrega a receita líquida e o que
 * foi devolvido, e a venda limpa é a soma dos dois. Não há consulta nova.
 */
export function vendaLimpa(r: ResumoComDevolucao): VendaLimpa {
  const valor = r.receita + r.valorDevolvido;

  return {
    quantidade: r.quantidade,
    valor,
    // O TICKET ACOMPANHA O NÚMERO QUE SE FALA. O `resumo` divide a receita
    // líquida; aqui a resposta é a venda limpa, então o ticket tem de ser
    // dela — senão a própria frase não fecha, e quem dividir R$ 1.893.544
    // por 29 acha R$ 65.294,62 onde está escrito R$ 64.157,86.
    ticketMedio: r.quantidade > 0 ? valor / r.quantidade : 0,
  };
}
