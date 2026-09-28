/**
 * A VENDEDORA PERGUNTOU O QUE NAO PODE SABER? — 29/09/2026.
 *
 * ==========================================================================
 * ISTO NAO E UMA BARREIRA. E UM REGISTRO.
 *
 * A barreira mora onde tem de morar: o dado nao existe no que chega ao modelo.
 * A ferramenta da vendedora devolve `disponivel: boolean` desde 25/09, e a API
 * de produtos omite custo e saldo desde 29/09 — ela pode perguntar o que
 * quiser, nao ha o que responder.
 *
 * O que este arquivo faz e atender ao requisito RN-01(g): "quando perguntas
 * como essa sao feitas queremos que voce as transforme em log para que a
 * equipe AT consiga ver no historico das conversas". Ou seja, a Equipe AT quer
 * SABER que a pergunta aconteceu — o que e informacao de gestao, nao de
 * seguranca.
 *
 * POR ISSO FALSO NEGATIVO AQUI NAO ABRE NADA. Se a heuristica deixar passar
 * "e ai, tem muito desse?", ninguem recebe estoque por isso: perde-se uma
 * linha de registro. E a razao de este arquivo poder ser uma lista de palavras
 * em vez de algo caro — o custo do erro e baixo dos dois lados.
 * ==========================================================================
 *
 * E FALSO POSITIVO? Tambem e barato, e por isso as expressoes sao especificas.
 * "quantas" sozinho pegaria "quantas clientes eu atendi hoje", que e pergunta
 * legitima sobre o trabalho dela — entao o termo so conta perto de peca,
 * estoque ou unidade.
 */

/** O assunto da pergunta, como rotulo fechado. Nunca o texto dela. */
export type AssuntoRestrito = 'quantidade' | 'custo';

/**
 * Padroes por assunto.
 *
 * SEM ACENTO NOS PADROES: o texto e normalizado antes da comparacao, porque
 * "preco" e "preço" sao a mesma pergunta e quem digita no WhatsApp escreve as
 * duas.
 */
const PADROES: Record<AssuntoRestrito, RegExp[]> = {
  quantidade: [
    // "quantas pecas", "quantos aneis tem", "quantas unidades"
    /\bquant[ao]s?\b[^.?!]{0,30}\b(pec|unidad|joia|anel|aneis|brinc|colar|pulseir|item|itens)/,
    // "quantos tem em estoque", "quanto tem no estoque"
    /\bquant[ao]s?\b[^.?!]{0,30}\bestoque\b/,
    // "qual a quantidade", "quantidade em estoque", "qtd"
    /\bquantidade\b/,
    /\bqtd\b/,
    // "tem quantas", "sobrou quantas", "resta quantos"
    /\b(tem|sobr|rest|dispon)\w*\b[^.?!]{0,15}\bquant[ao]s?\b/,
    // "saldo em estoque", "estoque atual", "quantas em estoque"
    /\b(saldo|estoque atual)\b/,
  ],
  custo: [
    // "preco de custo", "valor de custo", "quanto custou para a loja"
    /\b(preco|valor)\b[^.?!]{0,15}\bcusto\b/,
    /\bcusto\b/,
    // "quanto a loja pagou", "quanto pagamos"
    /\bquanto\b[^.?!]{0,20}\b(a loja |nos |a gente )?(pag|compr)\w*/,
    // "margem", "markup", "quanto a gente lucra"
    /\bmargem\b/,
    /\bmark ?up\b/,
    /\bquanto\b[^.?!]{0,20}\blucr\w*/,
    // "valor de compra"
    /\bvalor de compra\b/,
  ],
};

/** Tira acento e caixa — "Preço de Custo" e "preco de custo" sao a mesma coisa. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Que assuntos restritos aparecem nesta mensagem.
 *
 * Devolve uma LISTA porque "qual o custo e quantas tem?" e uma pergunta so com
 * dois assuntos, e registrar um deles perderia metade do que a Equipe AT quer
 * enxergar.
 */
export function assuntosRestritosEm(texto: string): AssuntoRestrito[] {
  const limpo = normalizar(texto);

  return (Object.keys(PADROES) as AssuntoRestrito[]).filter((assunto) =>
    PADROES[assunto].some((re) => re.test(limpo)),
  );
}
