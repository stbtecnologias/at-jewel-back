import { codigosNaBusca } from './produto.repository';

/**
 * ==========================================================================
 * "AN24084 ME DÁ A DESCRIÇÃO DESSE PRODUTO" — 06/10/2026.
 *
 * A gestora pediu isso à Anastasia. A peça existe, está ativa e custa
 * R$ 37.900 — ANEL FLOWER OA 18K 8.6G 45 SAF 1.54 CTS 50BROW. A resposta foi:
 *
 *   "O catálogo não me devolveu nada para AN24084 — pode ser que o código
 *    esteja um pouco diferente. Confere se é esse mesmo..."
 *
 * A busca liga as palavras por AND: cada uma precisa aparecer em algum campo.
 * "descrição" não aparece em campo nenhum, então a consulta voltou vazia — e
 * a agente INVENTOU uma explicação para o vazio.
 *
 * É a mesma família do "Rafaela Santos" de 02/10, e a lição é a mesma: o
 * defeito mais caro é o que responde com confiança, porque quem pergunta
 * desiste ali e nunca vira chamado.
 * ==========================================================================
 */
describe('codigosNaBusca — o código vale sozinho', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('acha o código no meio da frase', () => {
    expect(codigosNaBusca('An24084 me dá a descrição desse produto')).toEqual([
      'AN24084',
    ]);
  });

  it('e também quando ele vem no fim', () => {
    expect(codigosNaBusca('me dá a descrição do produto An24084')).toEqual([
      'AN24084',
    ]);
  });

  /**
   * `palavrasDaBusca` para na QUARTA palavra longa. Aqui o código é a sétima:
   * sem uma lista própria, ele é cortado antes de chegar ao SQL.
   */
  it('não é cortado pelo limite de quatro palavras', () => {
    expect(
      codigosNaBusca('qual a descrição completa daquele anel bonito An24084'),
    ).toEqual(['AN24084']);
  });

  /**
   * ====================================================================
   * O TESTE QUE MATOU A PRIMEIRA VERSÃO DESTA CORREÇÃO.
   *
   * Antes a regra era "qualquer palavra pode ser código". Mas existem
   * produtos cadastrados com `codigo_erp` igual a ANEL, COLAR, BRINCO,
   * PINGENTE e PULSEIRA — cinco de cada, conferidos na base. Procurar
   * "anel ouro" passava a trazer, junto, a peça cujo código é ANEL.
   *
   * Exigir DÍGITO resolve pela raiz, e não por lista de exceções.
   * ====================================================================
   */
  it('palavra sem dígito NÃO é código — senão "anel" traria a peça de código ANEL', () => {
    expect(codigosNaBusca('anel ouro')).toEqual([]);
    expect(codigosNaBusca('colar safira')).toEqual([]);
    expect(codigosNaBusca('brinco de esmeralda')).toEqual([]);
  });

  it('número puro também não é código', () => {
    // "1.54 CTS" aparece em descrição de peça o tempo todo.
    expect(codigosNaBusca('safira 1.54')).toEqual([]);
  });

  /** Quem escreve pergunta, e não consulta: a pontuação vem grudada. */
  it.each([
    ['tem o CO24022?', ['CO24022']],
    ['AN24084.', ['AN24084']],
    ['"AN24084"', ['AN24084']],
    ['(AN24084)', ['AN24084']],
    ['AN24084,', ['AN24084']],
  ])('tira a pontuação das bordas: %s', (entrada, esperado) => {
    expect(codigosNaBusca(entrada)).toEqual(esperado);
  });

  it('o hífen do meio FICA — faz parte do código', () => {
    // `SEED-P0002` é código de verdade na base de desenvolvimento.
    expect(codigosNaBusca('SEED-P0002')).toEqual(['SEED-P0002']);
  });

  it('devolve em caixa alta, porque a comparação é por upper()', () => {
    expect(codigosNaBusca('an24084')).toEqual(['AN24084']);
  });

  it('busca vazia não devolve código nenhum', () => {
    // Uma lista vazia faz o `= ANY(...)` não casar nada, que é o certo:
    // com busca vazia o filtro inteiro não deve existir.
    expect(codigosNaBusca('')).toEqual([]);
    expect(codigosNaBusca('   ')).toEqual([]);
    expect(codigosNaBusca(undefined)).toEqual([]);
  });

  it('para em quatro códigos', () => {
    // O mesmo teto das palavras: uma frase com vinte códigos é colagem, e
    // vinte condições no SQL não ajudam ninguém.
    expect(
      codigosNaBusca('A1111 B2222 C3333 D4444 E5555 F6666'),
    ).toHaveLength(4);
  });

  it('duas ou menos letras não bastam', () => {
    // "A1" é curto demais para ser código de verdade, e casaria por acidente.
    expect(codigosNaBusca('A1 peça')).toEqual([]);
  });
});
