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

/**
 * ============================================================================
 * O CAMINHO DE VOLTA: A SIGLA DIGITADA DIRETO — 09/10/2026, achado em produção.
 *
 *   — "Tem peças OB?"
 *   — "Você quer dizer um código que começa com OB? Me confirma como aparece."
 *
 * A agente se salvou perguntando, mas foi sorte do modelo. No código, "OB"
 * virava grupo NENHUM: duas letras não passavam pelo corte que existe para
 * tirar "de", "do", "e". Sem grupo não há filtro, e sem filtro a consulta
 * devolve o CATÁLOGO INTEIRO — 546 peças com saldo — com cara de resposta.
 *
 * E o caso silencioso é pior: "anel OB" virava só `[anel]`. Todos os anéis,
 * e nada dizendo que o OB foi ignorado.
 *
 * OB e OA são as duas siglas mais usadas da base: 3.057 e 2.222 peças.
 * ============================================================================
 */
describe('a sigla digitada direto', () => {
  /* ESTE É O TESTE. */
  it('"OB" vira UM GRUPO, e não grupo nenhum', () => {
    expect(gruposDaBusca('OB')).toEqual([{ termos: [], siglas: ['OB'] }]);
  });

  it('entra como SIGLA e não como termo — é o que evita "cobre"', () => {
    // Em `termos` ela viraria ILIKE '%OB%' e casaria cobre, objeto, globo.
    // Em `siglas` casa por fronteira de palavra. A diferença é o arquivo.
    const [grupo] = gruposDaBusca('OB');
    expect(grupo.termos).toEqual([]);
    expect(grupo.siglas).toEqual(['OB']);
  });

  it('aceita minúscula, porque ninguém digita em caixa alta no WhatsApp', () => {
    expect(gruposDaBusca('ob')).toEqual([{ termos: [], siglas: ['OB'] }]);
    expect(gruposDaBusca('oa')).toEqual([{ termos: [], siglas: ['OA'] }]);
  });

  it('TODAS as siglas de duas letras sobrevivem ao corte', () => {
    // CT, FY, OA, OB, ON, OR, PT, TP, TQ — as que o filtro comia.
    for (const sigla of ['CT', 'FY', 'OA', 'OB', 'ON', 'OR', 'PT', 'TP', 'TQ']) {
      expect(gruposDaBusca(sigla)).toEqual([{ termos: [], siglas: [sigla] }]);
    }
  });

  it('palavra curta que NÃO é sigla continua saindo', () => {
    // O corte não foi afrouxado: só abriu exceção para sigla conhecida.
    expect(gruposDaBusca('de')).toEqual([]);
    expect(gruposDaBusca('e')).toEqual([]);
    expect(gruposDaBusca('anel de ouro amarelo')).toEqual([
      { termos: ['anel'], siglas: [] },
      { termos: ['ouro', 'amarelo'], siglas: ['OA'] },
    ]);
  });

  it('"anel OB" mantém as DUAS condições — o caso silencioso', () => {
    expect(gruposDaBusca('anel OB')).toEqual([
      { termos: ['anel'], siglas: [] },
      { termos: [], siglas: ['OB'] },
    ]);
  });

  it('combina duas siglas: "DMT OA" — o pedido do Lucas', () => {
    // Medido na base depois do conserto: 74 peças com saldo. Antes, a OA
    // sumia e a resposta trazia as 188 de DMT como se fossem as pedidas.
    expect(gruposDaBusca('DMT OA')).toEqual([
      { termos: [], siglas: ['DMT'] },
      { termos: [], siglas: ['OA'] },
    ]);
  });

  it('sigla de três letras também vira sigla, não substring', () => {
    // DTS como termo seria ILIKE '%DTS%'; como sigla, palavra inteira.
    expect(gruposDaBusca('DTS')).toEqual([{ termos: [], siglas: ['DTS'] }]);
  });

  it('o conjunto de siglas sai da TABELA, e não de uma lista à mão', () => {
    // Sigla nova no dicionário passa a ser reconhecida na digitação no
    // mesmo commit. Se alguém fixar a lista, isto quebra ao crescer.
    const todas = new Set(Object.values(SINONIMOS).flat());
    for (const sigla of todas) {
      expect(gruposDaBusca(sigla)).toEqual([{ termos: [], siglas: [sigla] }]);
    }
  });
});
