/**
 * O NÍVEL DE FIDELIDADE DO CLIENTE — 09/10/2026.
 *
 * ==========================================================================
 * A REGRA JÁ EXISTIA, E ESTAVA SÓ EM SQL.
 *
 * Ela vivia dentro do `distribuicaoTiers` do repositório de clientes, e é o
 * que o cartão "Clientes Ouro" e o gráfico "Fidelidade" da tela de Clientes
 * mostram desde sempre. Quando a agente passou a responder a MESMA pergunta
 * pelo WhatsApp, escrever a regra uma segunda vez era garantir que um dia
 * divergiriam — e "cliente Ouro" é uma palavra que a loja usa, não um número
 * de tela. Duas respostas para a mesma palavra é pior que resposta nenhuma.
 *
 * Então o SQL do painel passou a SAIR DAQUI. Quem quiser mudar os cortes
 * muda `MINIMO_PRATA` e `MINIMO_OURO`, e os dois caminhos mudam juntos.
 * ==========================================================================
 *
 * DECISÃO DO LUCAS, 09/10/2026: **fidelidade é recorrência.** O nível sai do
 * número de compras e de nada mais. O valor aparece na linha, para quem lê
 * decidir, mas não classifica.
 *
 * Isso foi escolhido contra a alternativa, e os dois lados foram medidos na
 * base no mesmo dia: por contagem há **48** clientes Ouro; se o valor líquido
 * entrasse na conta (3+ compras e R$ 100 mil) seriam **76**, e apenas **35**
 * estariam nos dois. Treze dos 48 de hoje cairiam — muitas compras, valores
 * baixos. São perguntas diferentes, e a loja escolheu esta.
 */

/** Os níveis, do mais alto para o mais baixo. A ordem é a da resposta. */
export const NIVEIS_DE_FIDELIDADE = [
  'Ouro',
  'Prata',
  'Bronze',
  'Sem compras',
] as const;

export type NivelDeFidelidade = (typeof NIVEIS_DE_FIDELIDADE)[number];

/**
 * Os cortes, em NÚMERO DE COMPRAS.
 *
 * Bronze começa em 1: quem tem zero não é Bronze, é "Sem compras" — e essa
 * quarta faixa existe porque ela é a maior de todas. Dos 1.096 clientes
 * cadastrados, 616 nunca compraram; dobrá-los em Bronze faria o nível mais
 * baixo parecer o mais comum por um motivo que não é fidelidade.
 */
export const MINIMO_PRATA = 3;
export const MINIMO_OURO = 6;

/**
 * O nível de quem fez `compras` compras.
 *
 * Negativo não existe e não é tratado: compra não se desconta. Uma devolução
 * é documento próprio e abate o VALOR, nunca a contagem — a mesma convenção
 * do `receitaLiquida`, para o número continuar reconciliável com a tela.
 */
export function nivelPorCompras(compras: number): NivelDeFidelidade {
  if (compras >= MINIMO_OURO) return 'Ouro';
  if (compras >= MINIMO_PRATA) return 'Prata';
  if (compras >= 1) return 'Bronze';
  return 'Sem compras';
}

/**
 * A MESMA REGRA, em SQL — gerada, e não transcrita.
 *
 * `compras` é a expressão que conta as compras no SELECT de quem chama
 * (`COUNT(v.id)`, `n`, o que for). Trocar um corte aqui em cima muda o painel
 * e a agente no mesmo commit, que é a razão deste arquivo existir.
 */
export function nivelEmSql(compras: string): string {
  return (
    `CASE WHEN ${compras} >= ${MINIMO_OURO} THEN 'Ouro'` +
    ` WHEN ${compras} >= ${MINIMO_PRATA} THEN 'Prata'` +
    ` WHEN ${compras} >= 1 THEN 'Bronze'` +
    ` ELSE 'Sem compras' END`
  );
}

/**
 * A ordem de exibição, em SQL, para o gráfico não sair alfabético.
 *
 * Sobe junto com o nível: 3 é Ouro. O painel ordenava por ela antes de este
 * arquivo existir e continua — é o que mantém Bronze antes de Prata na barra.
 */
export function ordemEmSql(compras: string): string {
  return (
    `CASE WHEN ${compras} >= ${MINIMO_OURO} THEN 3` +
    ` WHEN ${compras} >= ${MINIMO_PRATA} THEN 2` +
    ` WHEN ${compras} >= 1 THEN 1` +
    ` ELSE 0 END`
  );
}

/**
 * Como a faixa se diz por extenso — para a agente não inventar o corte.
 *
 * Sem isto, ela diria "Ouro é quem compra muito" ou chutaria um número. A
 * frase sai das constantes, então nunca fica velha.
 */
export function nivelEmPalavras(nivel: NivelDeFidelidade): string {
  switch (nivel) {
    case 'Ouro':
      return `${MINIMO_OURO} compras ou mais`;
    case 'Prata':
      return `de ${MINIMO_PRATA} a ${MINIMO_OURO - 1} compras`;
    case 'Bronze':
      // "de 1 a 2", e nao "1 ou 2": a segunda forma esqueceria o meio calado
      // se MINIMO_PRATA subisse para 4.
      return `de 1 a ${MINIMO_PRATA - 1} compras`;
    case 'Sem compras':
      return 'nenhuma compra registrada';
  }
}

/**
 * A LINHA DE UM CLIENTE NA RESPOSTA — e ela mora aqui, não em cada canal.
 *
 * ==========================================================================
 * OS DOIS CANAIS DIZEM A MESMA COISA, NA MESMA ORDEM.
 *
 * A Helena e a Anastasia respondem a mesma pergunta para pessoas diferentes.
 * Se cada serviço montasse a frase, uma diria "9 compras, R$ 1.148.377" e a
 * outra "R$ 1.148.377 em 9 compras" — e quando a gerente conferisse a lista
 * com a vendedora, as duas pareceriam de sistemas diferentes.
 * ==========================================================================
 *
 * O VALOR VEM DEPOIS DAS COMPRAS, de propósito: o nível é a contagem, e é ela
 * que explica por que a pessoa está naquela faixa. O valor é contexto.
 *
 * A VENDEDORA SÓ ENTRA QUANDO HÁ UMA — e quando não há, a linha DIZ que não
 * há, em vez de omitir. Omitir faria 19 dos 48 clientes Ouro parecerem um
 * erro de formatação.
 */
export function linhaDoClienteFiel(c: {
  nome: string;
  nivel: NivelDeFidelidade;
  compras: number;
  valorLiquido: number;
  ultimaCompra: Date | null;
  vendedoraNome: string | null;
}): string {
  const valor = c.valorLiquido.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
  const quando = c.ultimaCompra
    ? `, última em ${c.ultimaCompra.toLocaleDateString('pt-BR')}`
    : '';
  const compras = `${c.compras} ${c.compras === 1 ? 'compra' : 'compras'}`;
  const dona = c.vendedoraNome
    ? ` — carteira da ${c.vendedoraNome}`
    : ' — SEM VENDEDORA na carteira';
  return `${c.nome} (${c.nivel}) — ${compras}, ${valor}${quando}${dona}`;
}

/**
 * O nível que a agente pediu, VALIDADO e não convertido.
 *
 * O modelo escreve o valor do enum, e enum escrito por modelo pode vir
 * "ouro", "OURO", "Gold" ou "Diamante". Converter às cegas num filtro faria a
 * consulta devolver vazio — e vazio é indistinguível de "não há nenhum", que
 * é a forma de erro mais cara que existe neste projeto. Devolve `null` quando
 * não reconhece, e quem chama decide o que dizer.
 */
export function nivelDaPergunta(texto?: string | null): NivelDeFidelidade | null {
  if (!texto) return null;
  const limpo = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return (
    NIVEIS_DE_FIDELIDADE.find(
      (n) =>
        n
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase() === limpo,
    ) ?? null
  );
}
