import { gruposDaBusca, SINONIMOS } from './sinonimos';

/**
 * RF6 e RF7. A vendedora escreve em português e o catálogo está em sigla.
 *
 * Medido na base em 08/10/2026: "brinco de diamante" acha ZERO peças com
 * estoque, e a loja tem 259 joias de diamante. A causa não é a busca — é que
 * `DTS` e `DMT` não são a palavra "diamante".
 */
describe('gruposDaBusca — a palavra dela e a sigla do catálogo', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('"diamante" leva as duas grafias do catálogo', () => {
    const grupos = gruposDaBusca('brinco de diamante');

    expect(grupos).toEqual([
      { termos: ['brinco'], siglas: [] },
      { termos: ['diamante'], siglas: ['DTS', 'DMT'] },
    ]);
  });

  /**
   * O RF7. `OA 18K` não contém "ouro" NEM "amarelo" — então quebrar a
   * expressão em duas palavras ligadas por E é o que faz a busca achar zero
   * hoje. As duas têm de virar um grupo só.
   */
  it('"ouro amarelo" é UM grupo, não dois', () => {
    expect(gruposDaBusca('anel de ouro amarelo')).toEqual([
      { termos: ['anel'], siglas: [] },
      { termos: ['ouro', 'amarelo'], siglas: ['OA'] },
    ]);
  });

  it('a expressão de duas palavras ganha da palavra sozinha', () => {
    /* "branco" sozinho também está no dicionário; a expressão vem primeiro. */
    const [grupo] = gruposDaBusca('ouro branco');

    expect(grupo.termos).toEqual(['ouro', 'branco']);
    expect(gruposDaBusca('colar branco')[1].termos).toEqual(['branco']);
  });

  it('acento e caixa não atrapalham', () => {
    expect(gruposDaBusca('topázio')[0].siglas).toEqual(['TP', 'TOP', 'TPPK']);
    expect(gruposDaBusca('ESMERALDA')[0].siglas).toEqual(['ESM']);
    expect(gruposDaBusca('Água Marinha')[0].siglas).toEqual(['AGM']);
  });

  it('palavra sem sigla passa intacta — a busca de hoje não muda', () => {
    expect(gruposDaBusca('colar vintage')).toEqual([
      { termos: ['colar'], siglas: [] },
      { termos: ['vintage'], siglas: [] },
    ]);
  });

  it('as palavrinhas de ligação saem, como já saíam', () => {
    expect(gruposDaBusca('anel de ouro')).toEqual([
      { termos: ['anel'], siglas: [] },
      { termos: ['ouro'], siglas: [] },
    ]);
  });

  it('para em quatro grupos, para a frase longa não virar oito condições', () => {
    expect(gruposDaBusca('anel colar brinco pulseira pingente')).toHaveLength(4);
  });

  it('busca vazia não devolve grupo nenhum', () => {
    expect(gruposDaBusca(undefined)).toEqual([]);
    expect(gruposDaBusca('')).toEqual([]);
    expect(gruposDaBusca('  de e  ')).toEqual([]);
  });
});

/**
 * ==========================================================================
 * AS SIGLAS FORAM PROVADAS CONTRA A BASE, e estes dois testes são o que
 * impede alguém de "arrumar" o dicionário juntando o que parece igual.
 * ==========================================================================
 */
describe('o dicionário — o que a base provou', () => {
  /**
   * As peças `RUB` dizem RBL e RUBL na etiqueta: é RUBELITA. Rubi é `RBI`, e
   * essas dizem RUBI. Juntar as duas misturaria pedras diferentes na mesma
   * lista de preço.
   */
  it('rubi e rubelita não se misturam', () => {
    expect(SINONIMOS['rubi']).toEqual(['RBI']);
    expect(SINONIMOS['rubelita']).not.toContain('RBI');
    expect(SINONIMOS['rubi']).not.toContain('RUB');
  });

  /** Das 60 peças com FY, 39 dizem FANCY na etiqueta. Não é uma pedra. */
  it('FY é fancy, e não entrou como pedra de diamante', () => {
    expect(SINONIMOS['fancy']).toEqual(['FY']);
    expect(SINONIMOS['diamante']).not.toContain('FY');
  });

  /** A base não diz o que são, e nenhuma tem saldo. */
  it('CD, MLQ e TURS ficaram de fora', () => {
    const todas = Object.values(SINONIMOS).flat();

    expect(todas).not.toContain('CD');
    expect(todas).not.toContain('MLQ');
    expect(todas).not.toContain('TURS');
  });

  /**
   * CTS casa quase toda etiqueta, então como filtro não filtra nada — mas as
   * palavras da busca são ligadas por E, e aí "quilates" sem tradução não casa
   * NADA e zera a busca inteira. Num E, palavra que casa tudo é inofensiva;
   * palavra que não casa nada é fatal.
   */
  it('quilate traduz, para não zerar a busca que o cita', () => {
    expect(gruposDaBusca('anel 2 quilates')).toEqual([
      { termos: ['anel'], siglas: [] },
      { termos: ['quilates'], siglas: ['CTS', 'CT'] },
    ]);
  });
});
