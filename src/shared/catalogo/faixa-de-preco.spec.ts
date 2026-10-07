import { faixaDePreco, faixaEmPalavras } from './faixa-de-preco';

/**
 * "Quero puxar uma tabela de peças até 20 mil reais, com fotos" — a gestora,
 * em 07/10/2026, e a agente respondeu que não conseguia.
 *
 * A faixa **não é fixa**: decisão do Lucas no mesmo dia — "é o que ela
 * definir; se ela quiser até 75.985,25, você traz".
 */
describe('faixaDePreco — a faixa é o que ela disser', () => {
  it('aceita número direto', () => {
    expect(faixaDePreco(1000, 20000)).toEqual({ de: 1000, ate: 20000 });
  });

  it('aceita só o teto, que é o pedido comum', () => {
    expect(faixaDePreco(undefined, 20000)).toEqual({ de: undefined, ate: 20000 });
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('aceita qualquer valor, e não uma lista de faixas', () => {
    expect(faixaDePreco(undefined, 75985.25).ate).toBe(75985.25);
    expect(faixaDePreco(undefined, '75.985,25').ate).toBe(75985.25);
  });

  /**
   * O modelo manda texto em campo numérico — já aconteceu em outras
   * ferramentas. "20.000" é vinte mil, não vinte.
   */
  it('lê o texto que o modelo manda', () => {
    expect(faixaDePreco(undefined, '20000').ate).toBe(20000);
    expect(faixaDePreco(undefined, '20.000').ate).toBe(20000);
    expect(faixaDePreco(undefined, ' 1500 ').ate).toBe(1500);
  });

  /**
   * O que não dá para ler com certeza é DESCARTADO, e não chutado: faixa
   * errada filtra em silêncio, e silêncio é o defeito que este dia combateu.
   */
  it('descarta o que não dá para ler', () => {
    expect(faixaDePreco(undefined, 'R$ 20 mil').ate).toBeUndefined();
    expect(faixaDePreco(undefined, 'vinte mil').ate).toBeUndefined();
    expect(faixaDePreco(undefined, '').ate).toBeUndefined();
    expect(faixaDePreco(undefined, -10).ate).toBeUndefined();
    expect(faixaDePreco(undefined, NaN).ate).toBeUndefined();
  });

  /** "De 20 mil a 5 mil" é a mesma faixa dita ao contrário. */
  it('faixa invertida é trocada, não recusada', () => {
    expect(faixaDePreco(20000, 5000)).toEqual({ de: 5000, ate: 20000 });
  });

  it('vira frase para a agente', () => {
    expect(faixaEmPalavras({ ate: 20000 })).toContain('20.000');
    expect(faixaEmPalavras({ de: 1000, ate: 2000 })).toContain('de ');
    expect(faixaEmPalavras({})).toBe('');
  });
});
