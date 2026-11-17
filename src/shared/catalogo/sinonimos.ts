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
  // DIAM ENTROU EM 29/10/2026, achado ao montar a ficha da peça para o prompt
  // de imagem: a etiqueta escreve `DIAM` em **174 peças**, e em **123 delas
  // sem DTS nem DMT**. Essas 123 eram invisíveis para quem buscava
  // "diamante" — "BRINCO GOTA 194 DIAM 6.37 CTS" não aparecia.
  // ==========================================================================
  // E `BRI`/`BRILH` ENTRARAM NO MESMO DIA, por decisão dele.
  //
  // "Brilhante" é LAPIDAÇÃO, não pedra — eu apontei isso e ele mandou entrar.
  // E a base lhe dá razão: na etiqueta da casa `BRI` aparece em **165 peças**
  // e sempre denota diamante ("BRINCO FIO BRI/BAGS" é brilhante/baguete, as
  // duas lapidações do diamante). Quem escreve "diamante" quer essas peças.
  //
  // O risco de juntar dois conceitos existe, mas é o oposto do defeito que
  // este arquivo combate: devolver zero quando a peça está lá.
  // ==========================================================================
  diamante: ['DTS', 'DMT', 'DIAM', 'BRI', 'BRILH'],
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
  // (As chaves de PEDRA acima são as que `PEDRAS`, no fim do arquivo, lista.
  //  Quem acrescentar pedra nova precisa acrescentar nos dois lugares.)
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

/**
 * A MESMA TABELA, LIDA AO CONTRARIO: sigla -> palavra — 29/10/2026.
 *
 * ==========================================================================
 * POR QUE AQUI, E NAO NUM SEGUNDO MAPA.
 *
 * O `SINONIMOS` responde "o que a etiqueta escreve quando a pessoa diz
 * esmeralda?". O prompt de imagem para o Marketing precisa da pergunta
 * virada: a etiqueta diz `ESM`, e o prompt em ingles precisa da palavra.
 *
 * E O MESMO CONHECIMENTO. Um segundo mapa diverge na primeira sigla nova que
 * alguem acrescentar de um lado so — e a tabela de cima nasceu dizendo que
 * "vai crescer: a equipe vai mandar as siglas dela". Invertida em tempo de
 * carga, ela cresce junto, de graca.
 *
 * COLISAO: uma sigla que aparece em mais de uma palavra fica com a PRIMEIRA,
 * e isso e intencional. `RUB` e rubelita (e nao rubi, que e `RBI`) — a
 * armadilha que o comentario la de cima descreve. A ordem do objeto e a
 * decisao, e ela ja foi tomada uma vez.
 * ==========================================================================
 */
const PALAVRA_DA_SIGLA: Readonly<Record<string, string>> = Object.freeze(
  Object.entries(SINONIMOS).reduce<Record<string, string>>(
    (mapa, [palavra, siglas]) => {
      for (const sigla of siglas) {
        if (!(sigla in mapa)) mapa[sigla] = palavra;
      }
      return mapa;
    },
    {},
  ),
);

/**
 * `ESM` -> `esmeralda`, `OB` -> `ouro branco`. `null` quando nao conhecemos.
 *
 * `null` E RESPOSTA, e nao falha: a etiqueta tem siglas que ninguem mapeou
 * ainda, e devolver a propria sigla faria o prompt em ingles carregar "OB"
 * como se fosse palavra.
 */
export function palavraDaSigla(sigla: string): string | null {
  return PALAVRA_DA_SIGLA[sigla.trim().toUpperCase()] ?? null;
}

/**
 * QUAIS CHAVES DO `SINONIMOS` SAO PEDRA — 29/10/2026.
 *
 * ==========================================================================
 * NASCEU DE UM DEFEITO QUE O TESTE PEGOU.
 *
 * A ficha da peca para o prompt de imagem varria a etiqueta procurando
 * siglas conhecidas, e devolveu:
 *
 *     Pedras: quilate, safira
 *
 * `quilate` nao e pedra: e a unidade `CTS`, que entrou no mapa em 08/10 por
 * um motivo legitimo da BUSCA. A varredura so excluia metal, entao a unidade
 * passou — e `quilate` viajaria para o prompt em ingles como se fosse o nome
 * de uma pedra. Nomear errado e exatamente o que faz a IA de imagem TROCAR a
 * pedra.
 *
 * A secao `--- pedra ---` do mapa acima ja dizia quais sao, mas so para quem
 * LE. Isto e a mesma informacao, para quem EXECUTA.
 * ==========================================================================
 */
export const PEDRAS: ReadonlySet<string> = new Set([
  'esmeralda',
  'diamante',
  'fancy',
  'rubi',
  'rubelita',
  'safira',
  'turquesa',
  'tanzanita',
  'topazio',
  'perola',
  'madreperola',
  'coral',
  'opala',
  'kunzita',
  'turmalina',
  'ametista',
  'citrino',
  'agua marinha',
  'morganita',
  'agata',
  'apatita',
]);

/**
 * QUAIS CHAVES DO `SINONIMOS` SÃO METAL — 16/11/2026.
 *
 * ==========================================================================
 * MESMO MOTIVO DO `PEDRAS`, E O MESMO DEFEITO ESPERANDO ACONTECER.
 *
 * O dicionário é de BUSCA e mistura tudo: `CTS` vira "quilate", `DMT` vira
 * "diamante", `RIV` vira "riviera". Quem ler a `cor` de uma peça pelo
 * dicionário cru e não conferir contra este conjunto vai acabar chamando
 * quilate de metal.
 *
 * `ouro rosa` NÃO entra: ela e `ouro rose` compartilham a sigla `OR`, e a
 * regra de colisão do `PALAVRA_DA_SIGLA` dá a vitória à primeira — `OR`
 * sempre devolve `ouro rose`, então `ouro rosa` é inalcançável por aqui.
 *
 * `amarelo` e `branco` também ficam de fora pelo mesmo motivo: existem para a
 * BUSCA achar decoração amarela de verdade, e `OA`/`OB` já caem em
 * `ouro amarelo` e `ouro branco`.
 * ==========================================================================
 */
export const METAIS: ReadonlySet<string> = new Set([
  'ouro branco',
  'ouro amarelo',
  'ouro rose',
  'ouro negro',
  'platina',
]);

/**
 * O METAL que a `cor` do cadastro nomeia, por extenso — ou `null`.
 *
 * A `cor` guarda duas coisas: nas joias é o material (`OA 18K`, `OB 18K`), na
 * roupa e na decoração é cor de verdade (`ONÇA`, `MÁRMORE`, `JAC.AZUL`). Só a
 * PRIMEIRA palavra é sigla — o `18K` que vem depois já se lê em qualquer
 * idioma.
 *
 * E é a primeira palavra INTEIRA, nunca um prefixo: `ONÇA` começa com `ON` e
 * são 19 peças de corset e saia que virariam ouro negro.
 */
export function metalDaCor(cor: string | null | undefined): string | null {
  const primeira = (cor ?? '').trim().split(/\s+/)[0];
  if (!primeira) return null;
  const palavra = palavraDaSigla(primeira);
  return palavra !== null && METAIS.has(palavra) ? palavra : null;
}

/**
 * O METAL nomeado na ETIQUETA — a segunda fonte, e o molde é o
 * `pedrasDaEtiqueta` da ficha da peça.
 *
 * Vale a pena: das 166 peças `JEWEL` sem `cor`, 53 dizem o metal na etiqueta
 * — "ANEL 50PTS DTS 2.50 CTS OB 18K". Medido em 16/11/2026.
 *
 * VARRE POR PALAVRA INTEIRA, e não por pedaço: `50PTS` são pontos de
 * diamante e contém `PT`. Procurar `PT` dentro das palavras transformaria
 * meia etiqueta da casa em platina.
 */
export function metalDaEtiqueta(
  etiqueta: string | null | undefined,
): string | null {
  for (const bruta of (etiqueta ?? '').toUpperCase().split(/[^A-Z0-9]+/)) {
    if (bruta.length < 2) continue;
    const palavra = palavraDaSigla(bruta);
    if (palavra !== null && METAIS.has(palavra)) return palavra;
  }
  return null;
}

/**
 * O TIPO DA PEÇA — 16/11/2026.
 *
 * ==========================================================================
 * A `familia` GUARDA O TIPO E O ESTILO, MISTURADOS.
 *
 * Medido no catálogo inteiro em 16/11:
 *
 *   RIVEIRA    ->  73 peças com código CO (colar)  e  17 com PU (pulseira)
 *   SOLITARIO  ->  29 BR, 13 CO, 8 AN, 1 PI
 *
 * Um colar riviera é um colar. Mas o `rankingPorFamilia` casa por igualdade
 * na `familia`, e ele sumia da conta: perguntada quantos colares saíram em
 * 2026, a agente respondia 108 quando a verdade é 118.
 *
 * DENTRO DA `JEWEL` O PREFIXO É LIMPO — estes seis cobrem 6.043 das 6.072
 * peças, e a cauda inteira são 29. FORA DELA O PREFIXO É LIXO: `CO` reúne
 * BANDEJA, COLAR, CORSET, LIVRO e SAIA; `C6` reúne BOWL, DIFUSOR, GUARDANAPO,
 * JARRA e VASO. Mas ali a `familia` é limpa: VASO 182, BOWL 132, LIVRO 104.
 *
 * Por isso a regra tem duas pernas, cada uma no terreno onde foi medida.
 * ==========================================================================
 */
export const PREFIXO_DO_TIPO: Readonly<Record<string, string>> = {
  CO: 'colar',
  BR: 'brinco',
  AN: 'anel',
  PU: 'pulseira',
  PI: 'pingente',
  PG: 'piercing',
  // A cauda: 29 peças em todo o catálogo, e cada uma tem nome.
  TO: 'tornozeleira',
  CJ: 'conjunto',
  AP: 'anel',
  AL: 'anel',
  EX: 'colar',
};

/** Quando o cadastro não diz nem código conhecido nem família. */
export const SEM_TIPO = 'sem tipo';

/**
 * A JOIA É UM CONJUNTO DE TIPOS, E NÃO UMA CATEGORIA.
 *
 * Os 14 "colares" que não são `JEWEL` em 2026 são colares de verdade —
 * COLLAB VR, WISH, GOLDESIGN —, com ouro 18K, diamante e fecho. A
 * `categoria` ali é linha comercial, não classe de material: separar o colar
 * da COLLAB do colar da JEWEL responderia a pergunta errada.
 *
 * SAI DO PRÓPRIO MAPA, e não de uma segunda lista escrita à mão: um tipo novo
 * entra em um lugar só.
 */
export const TIPOS_DE_JOIA: ReadonlySet<string> = new Set(
  Object.values(PREFIXO_DO_TIPO),
);

export function ehJoia(tipo: string): boolean {
  return TIPOS_DE_JOIA.has(tipo);
}

/**
 * O CAMINHO INVERSO: da palavra para os prefixos — 16/11/2026.
 *
 * É o que o `rankingPorFamilia` precisa para contar certo. Perguntada
 * "quantos colares", a consulta tem de procurar `CO` e `EX` no código das
 * joias, e não a palavra COLAR na `familia` — senão os colares riviera e
 * solitário ficam de fora.
 *
 * `null` PARA O QUE NÃO É TIPO DE JOIA, e isso preserva o que já funcionava:
 * "quantas rivieras vendemos" segue casando pela `familia`, porque riviera é
 * estilo, não tipo. O vaso e o corset idem.
 */
export function prefixosDoTipo(tipo: string): string[] | null {
  const palavra = tipo.trim().toLowerCase();
  if (!TIPOS_DE_JOIA.has(palavra)) return null;
  return Object.entries(PREFIXO_DO_TIPO)
    .filter(([, nome]) => nome === palavra)
    .map(([prefixo]) => prefixo);
}

/**
 * O tipo da peça, em uma palavra — a mesma para as duas pernas, para que o
 * colar da COLLAB e o colar da JEWEL somem numa linha só.
 */
export function tipoDaPeca(peca: {
  categoria?: string | null;
  codigoErp?: string | null;
  familia?: string | null;
}): string {
  if ((peca.categoria ?? '').trim().toUpperCase() === 'JEWEL') {
    // SOBE PARA MAIÚSCULA: existe uma peça cadastrada com `br` minúsculo.
    const prefixo = (peca.codigoErp ?? '').trim().slice(0, 2).toUpperCase();
    const tipo = PREFIXO_DO_TIPO[prefixo];
    if (tipo) return tipo;
  }
  return (peca.familia ?? '').trim().toLowerCase() || SEM_TIPO;
}

/**
 * A PEDRA QUE A PESSOA PEDIU, pelo nome que ela usou — 16/11/2026.
 *
 * ==========================================================================
 * TRÊS CAMINHOS, PORQUE NENHUM SOZINHO BASTA.
 *
 * Medido contra o dicionário em 16/11: `diamante` e `esmeralda` casam
 * diretos; `DTS` e `BRI` só casam por sigla; e `pérola`, `topázio` e
 * `diamantes` não casam de jeito nenhum — acento e plural, que é exatamente
 * como a gestora digita.
 *
 * O ACENTO SAI DOS DOIS LADOS: o dicionário escreve `topazio` e `perola` sem
 * acento, então comparar texto cru erraria mesmo com a palavra certa.
 *
 * `null` É RESPOSTA, e boa: quem chama devolve a lista das pedras e pergunta
 * qual — o mesmo caminho que o `quem_mais_vende` já usa para família.
 * ==========================================================================
 */
// O `semAcento` DA CASA JA FAZ ISSO, e baixa a caixa junto. Ele mora umas
// quatrocentas linhas acima, servindo a busca do catalogo desde 08/10.

export function pedraDoTermo(termo: string): string | null {
  const limpo = semAcento(termo.trim().toLowerCase());
  if (!limpo) return null;

  // O plural só é tentado DEPOIS do nome inteiro: nenhuma pedra do
  // dicionário termina em "s", mas tirar letra antes de tentar o nome
  // completo é o tipo de atalho que um dia morde.
  for (const candidato of [limpo, limpo.replace(/s$/, '')]) {
    for (const pedra of PEDRAS) {
      if (semAcento(pedra) === candidato) return pedra;
    }
  }

  const porSigla = palavraDaSigla(termo.trim());
  return porSigla !== null && PEDRAS.has(porSigla) ? porSigla : null;
}

/**
 * AS PEDRAS DA PEÇA, pelas DUAS fontes — e nenhuma delas basta sozinha.
 *
 * Medido em 16/11/2026 nas 582 peças vendidas no ano: juntas, as duas
 * reconhecem pedra em 337. O campo `tipo_pedra` sozinho perderia 43 peças; a
 * etiqueta sozinha perderia 49.
 *
 * SÓ AS QUE O `PEDRAS` LISTA, e isso nasceu de um defeito que o teste pegou:
 * a primeira versão excluía só metal e devolveu "Pedras: quilate, safira", porque
 * `CTS` está no mapa por um motivo legítimo da BUSCA e vira "quilate".
 *
 * Esta função nasceu dentro da `ficha-da-peca.ts`, que já fazia exatamente
 * isto. Mudou de casa para o lado do `PEDRAS` — e ganhou no caminho a
 * conferência contra o conjunto também no campo `tipo_pedra`, que lá não
 * existia: sem ela, um `tipo_pedra` com sigla de quilate viraria uma pedra
 * chamada "quilate".
 */
export function pedrasDaPeca(
  tipoPedra: string | null | undefined,
  etiqueta: string | null | undefined,
): string[] {
  const achadas = new Set<string>();

  const doCampo = (tipoPedra ?? '').trim();
  if (doCampo) {
    const palavra = palavraDaSigla(doCampo);
    if (palavra !== null && PEDRAS.has(palavra)) achadas.add(palavra);
  }

  // PALAVRA INTEIRA, nunca pedaço — o mesmo cuidado do `metalDaEtiqueta`.
  for (const bruta of (etiqueta ?? '').toUpperCase().split(/[^A-Z0-9]+/)) {
    if (bruta.length < 2) continue;
    const palavra = palavraDaSigla(bruta);
    if (palavra !== null && PEDRAS.has(palavra)) achadas.add(palavra);
  }

  return [...achadas];
}
