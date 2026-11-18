import { vendaLimpa } from './venda-limpa';

describe('a venda limpa', () => {
  /** Os números de produção, 01 a 17/11/2026, medidos na cópia. */
  const NOVEMBRO = { quantidade: 29, receita: 1860578, valorDevolvido: 32966 };

  /* ESTE É O TESTE. */
  it('NÃO abate a devolução — é venda, e não caixa', () => {
    expect(vendaLimpa(NOVEMBRO).valor).toBe(1893544);
  });

  it('o ticket divide a venda limpa, e não a receita', () => {
    // 1.893.544 / 29 = 65.294,62. A receita líquida daria 64.157,86, e a
    // frase não fecharia com o próprio número que ela diz.
    expect(vendaLimpa(NOVEMBRO).ticketMedio).toBeCloseTo(1893544 / 29, 2);
  });

  it('sem devolução no período, é a receita mesmo', () => {
    const r = vendaLimpa({ quantidade: 10, receita: 50000, valorDevolvido: 0 });

    expect(r.valor).toBe(50000);
    expect(r.ticketMedio).toBe(5000);
  });

  it('sem venda nenhuma, o ticket é zero e não NaN', () => {
    const r = vendaLimpa({ quantidade: 0, receita: 0, valorDevolvido: 0 });

    expect(r.valor).toBe(0);
    expect(r.ticketMedio).toBe(0);
  });

  /**
   * SÓ DEVOLUÇÃO NO PERÍODO: a receita vem negativa do repositório, e a
   * venda limpa tem de dar ZERO — não houve venda. Era o caso que fazia a
   * ALINE PINHO aparecer no ranking de novembro com −R$ 10.920.
   */
  it('período só com devolução dá venda zero, e não negativa', () => {
    const r = vendaLimpa({ quantidade: 0, receita: -10920, valorDevolvido: 10920 });

    expect(r.valor).toBe(0);
    expect(r.ticketMedio).toBe(0);
  });
});
