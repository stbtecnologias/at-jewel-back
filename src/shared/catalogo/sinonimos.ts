/**
 * O DICIONÁRIO QUE A BASE JÁ TINHA — 08/10/2026. RF6 e RF7.
 *
 * ==========================================================================
 * A VENDEDORA ESCREVE EM PORTUGUÊS. O CATÁLOGO ESTÁ ESCRITO EM SIGLA.
 *
 * Medido na base em 08/10, e o número é o requisito inteiro:
 *
 *   "brinco de diamante"  ->  ZERO peças com estoque.
 *   A loja tem 259 joias de diamante para vender.
 *
 * É a resposta errada registrada em 07/10 — "Não achei nenhum brinco de
 * diamante em estoque" — e a causa não era a busca: `DTS` e `DMT` não são a
 * palavra "diamante". Somando as buscas deste arquivo, o que tem saldo salta
 * de 74 para 1.152 achados.
 *
 * O RF7 ("a cor amarela trazia joia e decoração junto") é o MESMO problema no
 * metal: `cor` guarda duas coisas — nas joias é o material (`OA 18K`,
 * `OB 18K`), na decoração é cor de verdade (`Verde`, `ONÇA`, `MARMORE`). Quem
 * escreve "amarelo" cai no segundo e perde o primeiro. Por isso os dois
 * requisitos são um arquivo só.
 * ==========================================================================
 *
 * ==========================================================================
 * AS SIGLAS FORAM PROVADAS, NÃO ADIVINHADAS.
 *
 * Para cada valor de `tipo_pedra` eu cruzei com as palavras da etiqueta DAS
 * MESMAS PEÇAS. Duas coisas que o chute teria errado:
 *
 *   `FY` é FANCY, não uma pedra. Das 60 peças com FY, 39 dizem FANCY na
 *   etiqueta — e as peças DMT também. É diamante colorido.
 *
 *   `RUB` NÃO é rubi: é RUBELITA. As peças RUB dizem RBL e RUBL na etiqueta.
 *   Rubi é `RBI`, e essas dizem RUBI. Duas siglas que parecem a mesma palavra
 *   são pedras diferentes, com preços diferentes.
 *
 * É a armadilha do DTS/DMT ao contrário, e mais caro: juntar RBI com RUB
 * misturaria duas pedras na mesma lista de preço.
 *
 * `CD`, `MLQ` e `TURS` ficaram DE FORA: a base não diz o que são e nenhuma
 * tem saldo. Entram quando a equipe disser.
 * ==========================================================================
 */

/**
 * A chave é como ELA escreve; o valor, as grafias que o catálogo usa.
 *
 * A chave vem sem acento e em minúscula porque a busca é normalizada antes de
 * consultar aqui (ver `semAcento`) — quem digita "topázio" cai em "topazio".
 *
 * Expressão de duas palavras é chave válida, e é o que faz o RF7 funcionar:
 * `OA 18K` não contém "ouro" nem "amarelo", então as duas palavras precisam
 * ser reconhecidas JUNTAS, antes de a frase ser quebrada.
 *
 * ESTA TABELA NASCEU PARA CRESCER. A equipe vai mandar as siglas dela; é só
 * acrescentar linha, e nenhum outro arquivo muda.
 */
export const SINONIMOS: Readonly<Record<string, readonly string[]>> = {
  // --- pedra -------------------------------------------------------------
  // Provadas pelo cruzamento com a etiqueta das mesmas peças.
  esmeralda: ['ESM'],
  diamante: ['DTS', 'DMT'],
  fancy: ['FY'],
  rubi: ['RBI'],
  rubelita: ['RUB', 'RBL', 'RUBL'],
  safira: ['SAF', 'SAFAZ', 'SAFRS', 'SAFAM'],
  turquesa: ['TQ'],
  tanzanita: ['TANZ', 'TAN'],
  topazio: ['TP', 'TOP', 'TPPK'],
  perola: ['PER'],
  madreperola: ['MDP'],
  coral: ['CRL'],
  opala: ['OPLBR', 'OPLAUS'],
  kunzita: ['KUM', 'KUNZ'],
  turmalina: ['TUR'],
  ametista: ['AMET'],
  citrino: ['CIT'],
  'agua marinha': ['AGM'],
  morganita: ['MORG'],
  agata: ['AGT'],
  apatita: ['APT'],

  // --- família ------------------------------------------------------------
  // RIVEIRA é como a coluna `familia` grava; RIV, como a etiqueta abrevia.
  riviera: ['RIV', 'RIVEIRA'],

  // --- metal: o RF7 -------------------------------------------------------
  // "ouro branco" vai de 5 para 193 com saldo; "ouro amarelo", de ZERO para
  // 164. ON e OR entram porque custam uma linha — o ganho hoje é zero e um.
  'ouro branco': ['OB'],
  'ouro amarelo': ['OA'],
  'ouro rose': ['OR'],
  'ouro rosa': ['OR'],
  'ouro negro': ['ON'],
  platina: ['PT'],

  // A cor sozinha, que é o pedido literal da reunião. A grafia em português
  // fica como alternativa, então a decoração amarela de verdade — as 11 peças
  // que casam com a palavra — continua achável.
  amarelo: ['OA'],
  branco: ['OB'],

  // --- unidade ------------------------------------------------------------
  // ==========================================================================
  // CTS ENTRA, E EU IA DEIXAR DE FORA — 08/10/2026.
  //
  // O plano excluía "quilate" com um argumento certo: CTS está em quase toda
  // etiqueta (4.294 peças), então como FILTRO ele não filtra nada.
  //
  // Mas o argumento olhava a palavra sozinha, e ela quase nunca vem sozinha.
  // As palavras da busca são ligadas por E, e aí a conta inverte:
  //
  //   "anel de 2 quilates"  sem CTS  ->  "quilates" não casa NADA, e o E
  //                                      zera a busca inteira.
  //                         com CTS  ->  os anéis com quilatagem.
  //
  // Num E, palavra que casa tudo é inofensiva; palavra que não casa nada é
  // fatal. Devolver zero quando existem 259 é o defeito que a leva de 07/10
  // inteira existe para não cometer.
  // ==========================================================================
  quilate: ['CTS', 'CT'],
  quilates: ['CTS', 'CT'],
};

/** Um pedaço da busca e as grafias que valem por ele. */
export interface GrupoDeBusca {
  /** As palavras que TODAS têm de aparecer, como ela escreveu. */
  termos: string[];
  /** Grafias equivalentes — qualquer uma serve, por PALAVRA INTEIRA. */
  siglas: string[];
}

/** Tira acento e caixa, para a chave do dicionário bater com o que ela digitou. */
function semAcento(palavra: string): string {
  return palavra
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Quantas palavras no máximo, igual ao corte que já existia na busca. */
const MAXIMO_DE_GRUPOS = 4;

/**
 * A busca livre quebrada em GRUPOS de grafias equivalentes.
 *
 * Substitui `palavrasDaBusca` na consulta: onde antes ia uma palavra, agora
 * vai um grupo. A consulta liga as grafias por OU e os grupos por E.
 *
 *   "anel de esmeralda"      -> [anel] E [esmeralda OU ESM]
 *   "anel de ouro amarelo"   -> [anel] E [(ouro E amarelo) OU OA]
 *
 * A EXPRESSÃO DE DUAS PALAVRAS É TESTADA PRIMEIRO, e é o que salva o RF7:
 * quebrada em duas, "ouro amarelo" exige que as duas palavras apareçam, e
 * `OA 18K` não tem nenhuma das duas — é por isso que a busca acha ZERO hoje.
 *
 * Mantém as duas regras que já valiam: palavra de até dois caracteres sai
 * ("de", "do", "e" casam com quase tudo) e o corte em quatro grupos, para uma
 * frase longa não virar oito condições no banco.
 *
 * ==========================================================================
 * E O CAMINHO DE VOLTA: A SIGLA DIGITADA DIRETO — 09/10/2026.
 *
 * O dicionário só sabia ir de palavra para sigla. Quem escreve a SIGLA — e
 * elas estão na ponta da língua de quem vende — não era atendido:
 *
 *   "Tem peças OB?"  ->  grupos []  ->  NENHUM filtro  ->  o catálogo
 *                                        inteiro, 546 peças com saldo
 *
 * E o caso pior é silencioso: "anel OB" virava só `[anel]`. A vendedora
 * receberia TODOS os anéis, e nada na resposta diria que o OB foi ignorado.
 * Em produção a agente se salvou perguntando "você quer dizer um código que
 * começa com OB?" — mas isso foi sorte do modelo, não do código.
 *
 * Duas letras não passavam pelo corte, e OB e OA são justamente as duas mais
 * usadas no catálogo: 3.057 e 2.222 peças.
 *
 * AGORA A SIGLA CONHECIDA SOBREVIVE AO CORTE, e entra como SIGLA e não como
 * palavra — ou seja, com fronteira de palavra. É a diferença entre achar
 * `OB 18K` e achar "cOBre", "OBjeto", "ONça": o `~* '\mOB\M'` casa só a
 * palavra inteira, e um ILIKE '%ob%' traria milhares por engano.
 * ==========================================================================
 */

/**
 * Toda sigla que a tabela conhece, para reconhecer quem a digita.
 *
 * Montado da PRÓPRIA tabela, e não escrito à mão: sigla nova passa a valer
 * nos dois sentidos no mesmo commit. Hoje são 41, nove delas com duas letras
 * — CT, FY, OA, OB, ON, OR, PT, TP, TQ —, que são as que o corte comia.
 */
const SIGLAS_CONHECIDAS: ReadonlySet<string> = new Set(
  Object.values(SINONIMOS).flatMap((s) => [...s]),
);

/** A palavra é uma sigla do catálogo? Compara em caixa alta. */
function ehSigla(palavra: string): boolean {
  return SIGLAS_CONHECIDAS.has(palavra.toUpperCase());
}

/**
 * AS SIGLAS, PARA A DESCRIÇÃO DA FERRAMENTA — 09/10/2026.
 *
 * ==========================================================================
 * O DICIONÁRIO VIVIA NO SQL, E O MODELO NÃO SABIA QUE ELE EXISTIA.
 *
 * Consertei a busca para entender "OB" e fui testar: a agente continuou sem
 * achar. Não era a busca — era que ela NUNCA CHAMAVA A FERRAMENTA:
 *
 *   — "Quais peças temos em OB"
 *   — "OB não é um tipo de peça que eu reconheça — você quis dizer alguma
 *      família específica, ou foi um código?"
 *
 * A descrição listava "nome, categoria, família, coleção, pedra, cor ou
 * código do ERP" e não dizia uma palavra sobre sigla. Pior: falava em CÓDIGO,
 * e foi para lá que o modelo foi — "um código que começa com OB?".
 *
 * Consertar o encanamento sem conferir se a água chega: a busca estava certa
 * e nenhuma pergunta a alcançava.
 * ==========================================================================
 *
 * A lista é GERADA da tabela, e não escrita na descrição: sigla nova passa a
 * ser reconhecida pelo modelo no mesmo commit em que entra no dicionário.
 */
export function siglasEmTexto(): string {
  return [...SIGLAS_CONHECIDAS].sort().join(', ');
}

export function gruposDaBusca(busca: string | undefined): GrupoDeBusca[] {
  const palavras = (busca ?? '')
    .trim()
    .split(/\s+/)
    // O corte de duas letras continua valendo, MENOS para sigla conhecida.
    .filter((p) => p.length > 2 || ehSigla(p));

  const grupos: GrupoDeBusca[] = [];
  let i = 0;

  while (i < palavras.length && grupos.length < MAXIMO_DE_GRUPOS) {
    const par = palavras.slice(i, i + 2);
    const chaveDoPar =
      par.length === 2 ? semAcento(par.join(' ')) : undefined;

    if (chaveDoPar && SINONIMOS[chaveDoPar]) {
      grupos.push({ termos: par, siglas: [...SINONIMOS[chaveDoPar]] });
      i += 2;
      continue;
    }

    const palavra = palavras[i];

    // A SIGLA DIGITADA DIRETO VIRA SIGLA, e não termo: `termos` vazio e o
    // casamento por fronteira de palavra. Pôr "OB" em `termos` faria um
    // ILIKE '%OB%' e traria "cobre", "objeto" — o oposto do que ela pediu.
    if (ehSigla(palavra)) {
      grupos.push({ termos: [], siglas: [palavra.toUpperCase()] });
      i += 1;
      continue;
    }

    const siglas = SINONIMOS[semAcento(palavra)] ?? [];
    grupos.push({ termos: [palavra], siglas: [...siglas] });
    i += 1;
  }

  return grupos;
}
