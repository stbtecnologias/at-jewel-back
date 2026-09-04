import { paraCentavos, somarEmReais } from './centavos';

describe('somarEmReais', () => {
  // O caso real que expos o problema: a movimentacao 1354219, testada em
  // producao em 04/09/2026.
  it('deve somar as tres parcelas da 1354219 sem ruido', () => {
    expect(somarEmReais([51566.66, 78926.67, 100000])).toBe(230493.33);
    // Prova de que a soma ingenua erraria:
    expect(51566.66 + 78926.67 + 100000).not.toBe(230493.33);
  });

  it('deve somar os sete itens da 1354219 batendo com o valor do documento', () => {
    const itens = [101340, 29940, 45540, 49740, 23940, 38340, 47940];
    expect(somarEmReais(itens)).toBe(336780);
  });

  // Os itens da 1315562 do dump — a unica com centavo quebrado nos itens.
  it('deve somar valores com centavo quebrado', () => {
    expect(somarEmReais([2467.5, 8175])).toBe(10642.5);
  });

  it('deve devolver 0 para lista vazia, e nao NaN', () => {
    expect(somarEmReais([])).toBe(0);
  });

  it('deve aceitar negativo — estorno e devolucao existem', () => {
    expect(somarEmReais([100.1, -100.1])).toBe(0);
    expect(somarEmReais([-20930])).toBe(-20930);
  });

  it('deve arredondar por parcela, sem acumular erro', () => {
    // Cem centavos somados um a um tem de dar exatamente um real.
    expect(somarEmReais(Array(100).fill(0.01))).toBe(1);
  });
});

describe('paraCentavos', () => {
  it('deve converter reais em centavos inteiros', () => {
    expect(paraCentavos(51566.66)).toBe(5156666);
    expect(paraCentavos(0)).toBe(0);
    expect(paraCentavos(-20930)).toBe(-2093000);
  });

  // O valor de entrada tambem pode chegar sujo, vindo de outra conta.
  it('deve limpar ruido do proprio valor de entrada', () => {
    expect(paraCentavos(2467.5000000000005)).toBe(246750);
  });
});
