/**
 * O NOME EXATO GANHA — a regra, num lugar só.
 *
 * ==========================================================================
 * UM EXATO ÚNICO NÃO É PALPITE.
 *
 * Quem busca por pedaço do nome recebe todo mundo que contém o pedaço, e aí
 * duas respostas são possíveis: perguntar de quem se trata, ou escolher. A
 * casa sempre escolheu PERGUNTAR, e com razão — agendar na vendedora errada
 * ou somar a venda da filial errada é erro silencioso, que só aparece quando
 * alguém reclama.
 *
 * Mas há um caso em que perguntar está errado: quando a pessoa escreveu o
 * nome INTEIRO e ele casa com um registro exatamente. Aí não há palpite a
 * dar, e devolver a pergunta é um beco: por mais exato que ela escreva, a
 * resposta é sempre a mesma lista.
 *
 * E ERA UM BECO DE VERDADE, medido em 27/10/2026: a maior empresa da casa,
 * com 1.110 vendas desde 2023, era INALCANÇÁVEL por qualquer frase —
 *
 *   empresa: "AT JEWEL LTDA"  ->  AMBIGUA / AT JEWEL LTDA | AT JEWEL LTDA - SP
 *
 * porque "AT JEWEL LTDA" é começo de "AT JEWEL LTDA - SP". A gestora só
 * conseguia a filial de SP, que tem duas vendas.
 * ==========================================================================
 *
 * A REGRA JÁ EXISTIA, escrita no `resolver-vendedora-por-nome.use-case`:
 * *"Exato primeiro: com 'Marina Albuquerque' e 'Marina Souza' na equipe, quem
 * escreveu o nome inteiro não deve receber pergunta de volta."* Ela só nunca
 * tinha chegado à busca de empresa. Agora mora aqui, e os dois a usam.
 *
 * O QUE ESTA FUNÇÃO NÃO FAZ: decidir. Ela estreita a lista; quem chama
 * continua respondendo "achei" com um e "qual delas?" com vários. Dois exatos
 * homônimos seguem sendo pergunta — isso é ambiguidade de verdade.
 */

/**
 * TODOS OS TRAÇOS SÃO O MESMO TRAÇO — 28/10/2026.
 *
 * ==========================================================================
 * O modelo escreve em português, e em português ele troca o hífen por
 * travessão sozinho. Medido no mesmo dia, perguntando a ela *"quem vendeu
 * pela AT JEWEL LTDA - SP?"*:
 *
 *   "AT JEWEL LTDA - SP"   (hífen)       -> OK, 2 vendas
 *   "AT JEWEL LTDA — SP"   (travessão)   -> NAO ENCONTRADA
 *   "AT JEWEL LTDA – SP"   (meia-risca)  -> NAO ENCONTRADA
 *
 * Um traço diferente e **a maior filial do grupo deixa de existir**. E a
 * resposta dela era *"não encontrei uma empresa com esse nome"* — correta do
 * ponto de vista do código, e inútil para quem lê.
 *
 * O conserto mora AQUI, junto do acento e da caixa, porque é o mesmo
 * problema: quem escreve não é quem cadastrou, e a diferença não é de
 * conteúdo.
 *
 * MONTADOS POR CÓDIGO, e não escritos: sete traços diferentes numa classe de
 * regex é uma linha que ninguém revisa, e que uma cópia desalinha.
 * ==========================================================================
 */
const TRACOS = new RegExp(
  // CLASSE, e não sequência: sem os colchetes o padrão casaria os sete traços
  // SEGUIDOS, que não acontece em nome nenhum — e foi o primeiro jeito que eu
  // escrevi isto, em 28/10. O teste contra o banco pegou: o travessão
  // continuava devolvendo "não encontrada".
  '[' +
    [
      8208, // hífen tipográfico
      8209, // hífen sem quebra
      8210, // traço numérico
      8211, // meia-risca
      8212, // travessão
      8213, // barra horizontal
      8722, // sinal de menos
    ]
      .map((c) => String.fromCharCode(c))
      .join('') +
    ']',
  'g',
);

/**
 * Sem acento, sem caixa, sem traço exótico, sem ponto — e sem espaço sobrando.
 *
 * O PONTO SAI pelo mesmo motivo do traço, e também foi medido: a casa se chama
 * **A.T. Jewel** no papel e `AT JEWEL` no cadastro. Depois do casamento por
 * palavra, estas três ainda falhavam —
 *
 *   "A.T SP"   ·   "A.T. JEWEL SP"   ·   "A.T. Jewel SP"
 *
 * — porque `a.t` não é a palavra `at`. Nenhum nome do cadastro tem ponto, então
 * tirá-lo não junta o que era separado.
 */
export function normalizarNome(valor: string): string {
  return (
    valor
      .normalize('NFD')
      // Faixa dos sinais diacríticos combinantes, escapada de propósito:
      // escrever os acentos literalmente aqui torna a linha ilegível e frágil
      // a cópia.
      .replace(/[̀-ͯ]/g, '')
      .replace(TRACOS, '-')
      .replace(/\./g, '')
      .toLowerCase()
      .trim()
  );
}

/**
 * Palavras que não são nome de nada — 28/10/2026.
 *
 * "filial de SP" e "a empresa de metais" dizem a mesma coisa que "SP" e
 * "metais", com cola gramatical em volta. Exigir que a cola esteja no cadastro
 * é exigir que quem pergunta adivinhe como alguém digitou.
 *
 * `ltda` NÃO entra aqui: ele existe nos nomes de verdade, e tirá-lo faria
 * "LTDA" sozinho casar com as oito.
 */
const COLA = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'a',
  'o',
  'e',
  'filial',
  'empresa',
  'loja',
  'unidade',
]);

/** As palavras que importam na busca, já normalizadas. */
function palavrasDaBusca(busca: string): string[] {
  return normalizarNome(busca)
    .split(/[\s-]+/)
    .filter((p) => p.length > 0 && !COLA.has(p));
}

/**
 * O termo casa com o nome?
 *
 * ==========================================================================
 * CASA POR PALAVRA, E NÃO POR PEDAÇO CONTÍNUO — 28/10/2026.
 *
 * Era `includes`, e isso obrigava a busca a ter a MESMA ORDEM e as MESMAS
 * palavras do meio. Medido contra as oito empresas, nestas formas de dizer a
 * filial de São Paulo:
 *
 *   "AT JEWEL LTDA - SP"  achava        "AT JEWEL SP"     NÃO achava
 *   "SP"                  achava        "AT SP"           NÃO achava
 *                                       "A.T. JEWEL SP"   NÃO achava
 *                                       "jewel sp"        NÃO achava
 *                                       "filial de SP"    NÃO achava
 *
 * Todas as que falhavam dizem a mesma empresa. O que elas não têm é o `LTDA`
 * do meio, na posição exata.
 *
 * A REGRA NOVA: toda palavra da busca tem de estar no nome, em qualquer ordem.
 * Mais exigente que o `includes` em um ponto (não basta um pedaço casar por
 * acidente) e mais frouxa no que importa (a ordem e a cola gramatical).
 *
 * E AMBÍGUO SEGUE AMBÍGUO: "AT JEWEL" tem duas palavras que estão nas duas
 * empresas, e continua devolvendo as duas — isso é pergunta de verdade, não
 * defeito.
 * ==========================================================================
 *
 * `apelidos` existe porque há nomes que NINGUÉM escreve como o cadastro:
 * ver `apelidos-de-empresa`.
 */
export function casaComNome(
  nome: string,
  busca: string,
  apelidos?: Record<string, string>,
): boolean {
  const palavras = palavrasDaBusca(comApelidos(busca, apelidos));
  if (palavras.length === 0) return true;
  const alvo = normalizarNome(nome);
  const doNome = new Set(palavrasDaBusca(nome));
  return palavras.every((p) => doNome.has(p) || alvo.includes(p));
}

/**
 * Troca o apelido pelo que está no cadastro, antes de comparar.
 *
 * A troca é por PALAVRA INTEIRA ou por frase inteira — "design" não pode virar
 * "desing" dentro de outra palavra, e "sao paulo" é duas palavras que viram
 * uma.
 */
function comApelidos(busca: string, apelidos?: Record<string, string>): string {
  if (!apelidos) return busca;
  let texto = normalizarNome(busca);
  for (const [apelido, cadastro] of Object.entries(apelidos)) {
    const alvo = normalizarNome(apelido);
    if (!alvo) continue;
    if (texto === alvo) return cadastro;
    // Frase inteira dentro do texto ("as vendas de sao paulo").
    if (texto.includes(alvo)) texto = texto.split(alvo).join(cadastro);
  }
  return texto;
}

/**
 * Estreita os candidatos aos que casam EXATAMENTE com a busca — e só quando
 * existe algum. Sem exato nenhum, a lista volta como estava.
 */
export function preferirExato<T>(
  candidatos: T[],
  busca: string,
  nomeDe: (c: T) => string,
): T[] {
  const alvo = normalizarNome(busca);
  if (!alvo) return candidatos;
  const exatos = candidatos.filter((c) => normalizarNome(nomeDe(c)) === alvo);
  return exatos.length > 0 ? exatos : candidatos;
}
