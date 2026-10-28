import { casaComNome, normalizarNome, preferirExato } from './nome-exato';

/**
 * ==========================================================================
 * A MAIOR EMPRESA DA CASA NÃO PODIA SER PEDIDA PELO NOME — 27/10/2026.
 *
 *   empresa: "AT JEWEL LTDA"  ->  AMBIGUA / AT JEWEL LTDA | AT JEWEL LTDA - SP
 *
 * As 1.110 vendas da AT JEWEL LTDA desde 2023 eram inalcançáveis por qualquer
 * frase, porque o nome dela é começo do nome da filial. A gestora só
 * conseguia a de SP, que tem duas vendas.
 * ==========================================================================
 */
const EMPRESAS = [
  { nome: 'AT JEWEL LTDA' },
  { nome: 'AT JEWEL LTDA - SP' },
  { nome: 'AT HOME LTDA' },
  { nome: 'MP COMERCIO DE METAIS LTDA' },
];

const nomes = (xs: { nome: string }[]) => xs.map((x) => x.nome);
const buscar = (termo: string) =>
  preferirExato(
    EMPRESAS.filter((e) =>
      normalizarNome(e.nome).includes(normalizarNome(termo)),
    ),
    termo,
    (e) => e.nome,
  );

describe('preferirExato — o nome inteiro não recebe pergunta de volta', () => {
  /* ESTE É O TESTE. */
  it('"AT JEWEL LTDA" resolve numa só, apesar da filial de SP', () => {
    expect(nomes(buscar('AT JEWEL LTDA'))).toEqual(['AT JEWEL LTDA']);
  });

  it('e a filial continua alcançável pelo nome dela', () => {
    expect(nomes(buscar('AT JEWEL LTDA - SP'))).toEqual(['AT JEWEL LTDA - SP']);
  });

  it('pedaço ambíguo SEGUE ambíguo — é pergunta de verdade', () => {
    // "AT JEWEL" não é o nome de ninguém: casa com duas, e aí perguntar é a
    // resposta certa. Estreitar aqui seria escolher pela pessoa.
    expect(nomes(buscar('AT JEWEL'))).toEqual([
      'AT JEWEL LTDA',
      'AT JEWEL LTDA - SP',
    ]);
  });

  it('pedaço que casa uma só continua resolvendo', () => {
    expect(nomes(buscar('MP COMERCIO'))).toEqual([
      'MP COMERCIO DE METAIS LTDA',
    ]);
  });

  it('caixa e acento não contam', () => {
    expect(nomes(buscar('at jewel ltda'))).toEqual(['AT JEWEL LTDA']);
    expect(
      nomes(
        preferirExato(
          [{ nome: 'MP COMÉRCIO' }, { nome: 'MP COMÉRCIO DE METAIS' }],
          'mp comercio',
          (e) => e.nome,
        ),
      ),
    ).toEqual(['MP COMÉRCIO']);
  });

  it('espaço sobrando não atrapalha — quem digita deixa espaço', () => {
    expect(nomes(buscar('  AT JEWEL LTDA  '))).toEqual(['AT JEWEL LTDA']);
  });

  it('DOIS exatos homônimos seguem ambíguos', () => {
    // Aqui a ambiguidade é real, e a função não inventa desempate.
    const dois = preferirExato(
      [{ nome: 'AT JEWEL LTDA' }, { nome: 'at jewel ltda' }],
      'AT JEWEL LTDA',
      (e) => e.nome,
    );
    expect(dois).toHaveLength(2);
  });

  it('sem exato nenhum, a lista volta intacta', () => {
    const todos = preferirExato(EMPRESAS, 'LTDA', (e) => e.nome);
    expect(todos).toHaveLength(4);
  });

  it('busca vazia não estreita nada', () => {
    expect(preferirExato(EMPRESAS, '   ', (e) => e.nome)).toHaveLength(4);
  });

  it('lista vazia continua vazia, e não estoura', () => {
    expect(
      preferirExato([], 'AT JEWEL LTDA', (e: { nome: string }) => e.nome),
    ).toEqual([]);
  });
});

describe('normalizarNome', () => {
  it('tira acento, caixa e espaço das pontas', () => {
    expect(normalizarNome('  MARÍNA Albuquerque ')).toBe('marina albuquerque');
  });

  it('não mexe no espaço do meio — "AT JEWEL" não é "ATJEWEL"', () => {
    expect(normalizarNome('AT  JEWEL')).toBe('at  jewel');
  });
});

/**
 * ==========================================================================
 * O TRAÇO QUE FAZIA A FILIAL DESAPARECER — 28/10/2026.
 *
 * Perguntei à Anastasia, com o modelo de verdade, *"quem vendeu pela AT JEWEL
 * LTDA - SP?"*. Ela chamou a ferramenta certa e respondeu **"não encontrei uma
 * empresa com esse nome"** — com a empresa existindo e tendo duas vendas.
 *
 * A causa: ela escreve em português, e em português o hífen vira travessão. O
 * banco guarda hífen, a busca era `ILIKE '%termo%'` cru, e um caractere
 * diferente apagava a filial.
 * ==========================================================================
 */
describe('o traço — todos são o mesmo traço', () => {
  const T = String.fromCharCode(8212); // — travessão
  const MR = String.fromCharCode(8211); // – meia-risca
  const MENOS = String.fromCharCode(8722); // − sinal de menos

  /* ESTE É O TESTE. */
  it('travessão casa com o hífen do cadastro', () => {
    expect(
      casaComNome('AT JEWEL LTDA - SP', 'AT JEWEL LTDA ' + T + ' SP'),
    ).toBe(true);
  });

  it('meia-risca e sinal de menos também', () => {
    for (const traco of [MR, MENOS]) {
      expect(
        casaComNome('AT JEWEL LTDA - SP', 'AT JEWEL LTDA ' + traco + ' SP'),
      ).toBe(true);
    }
  });

  it('e o traço não atrapalha o EXATO', () => {
    // O "nome exato ganha" tem de continuar valendo com o traço trocado: é o
    // caso que destrava a matriz (1.110 vendas) sem levar a filial.
    const empresas = [
      { nome: 'AT JEWEL LTDA' },
      { nome: 'AT JEWEL LTDA - SP' },
    ];
    const comTravessao = preferirExato(
      empresas,
      'AT JEWEL LTDA ' + T + ' SP',
      (e) => e.nome,
    );
    expect(comTravessao.map((e) => e.nome)).toEqual(['AT JEWEL LTDA - SP']);
  });

  /**
   * A CLASSE, E NÃO A SEQUÊNCIA — o primeiro jeito que eu escrevi isto estava
   * errado: sem os colchetes, o padrão casaria os sete traços SEGUIDOS. O teste
   * contra o banco pegou, e este teste existe para não precisar do banco de
   * novo.
   */
  it('um traço só, e não os sete seguidos', () => {
    expect(normalizarNome('a' + T + 'b')).toBe('a-b');
    expect(normalizarNome('a' + MR + 'b')).toBe('a-b');
  });

  it('o que não é traço continua intacto', () => {
    expect(normalizarNome('MP COMERCIO DE METAIS LTDA')).toBe(
      'mp comercio de metais ltda',
    );
  });
});

/**
 * ==========================================================================
 * AS FORMAS DE DIZER A FILIAL DE SÃO PAULO — 28/10/2026.
 *
 * Medi vinte e três contra as oito empresas, e o quadro era este: achavam só
 * "AT JEWEL LTDA - SP" e "SP". Falhavam "AT JEWEL SP", "AT SP", "A.T. JEWEL
 * SP", "jewel sp", "filial de SP" e — a mais natural de todas — **"São
 * Paulo"**.
 *
 * Três causas diferentes, e o teste cobre as três: o pedaço contínuo, o ponto
 * da sigla, e a palavra que simplesmente não está no cadastro.
 * ==========================================================================
 */
describe('as formas de dizer a mesma empresa', () => {
  const T = String.fromCharCode(8212);
  const SP = 'AT JEWEL LTDA - SP';
  const MATRIZ = 'AT JEWEL LTDA';
  const APELIDOS = { 'sao paulo': 'sp', design: 'desing' };

  /* ESTE É O TESTE. */
  it.each([
    'AT JEWEL LTDA - SP',
    'AT JEWEL LTDA ' + T + ' SP',
    'AT JEWEL LTDA SP',
    'AT JEWEL SP',
    'AT SP',
    'A.T SP',
    'A.T. JEWEL SP',
    'jewel sp',
    'SP',
    'filial de SP',
    'a loja de Sao Paulo',
    'São Paulo',
  ])('"%s" acha a filial', (busca) => {
    expect(casaComNome(SP, busca, APELIDOS)).toBe(true);
  });

  it('e nenhuma delas leva a MATRIZ junto por acidente', () => {
    // A matriz não tem "sp": é o que faz o recorte ser do CNPJ certo.
    for (const busca of ['SP', 'AT JEWEL SP', 'São Paulo', 'filial de SP']) {
      expect(casaComNome(MATRIZ, busca, APELIDOS)).toBe(false);
    }
  });

  it('"AT JEWEL" segue nas DUAS — ambíguo de verdade', () => {
    expect(casaComNome(SP, 'AT JEWEL', APELIDOS)).toBe(true);
    expect(casaComNome(MATRIZ, 'AT JEWEL', APELIDOS)).toBe(true);
  });

  /**
   * O APELIDO DO TYPO DO ERP: a empresa 007 está cadastrada como
   * "AT DESING DE PRODUTOS LTDA". Quem escreve "design" tem razão, e o
   * cadastro não.
   */
  it('"design" acha a empresa cadastrada como DESING', () => {
    expect(casaComNome('AT DESING DE PRODUTOS LTDA', 'design', APELIDOS)).toBe(
      true,
    );
  });

  it('empresa que não existe continua não existindo', () => {
    expect(casaComNome(SP, 'AT MARTE', APELIDOS)).toBe(false);
    expect(casaComNome(MATRIZ, 'AT MARTE', APELIDOS)).toBe(false);
  });

  it('sem apelido, "São Paulo" não acha — o mapa é que resolve', () => {
    // Guarda contra alguém "simplificar" tirando o mapa: a normalização
    // sozinha nunca vai inventar a palavra que falta no cadastro.
    expect(casaComNome(SP, 'São Paulo')).toBe(false);
  });
});
