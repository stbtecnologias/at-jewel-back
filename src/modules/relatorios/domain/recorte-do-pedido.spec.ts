import { recorteDoPedido } from './recorte-do-pedido';

/**
 * O RECORTE DA PERGUNTA NO TÍTULO DO ARQUIVO — 26/10/2026.
 *
 * ==========================================================================
 * O caso que trouxe isto: "quais peças mais vendidas da Camila em agosto
 * 2026", "gera o pdf", e um PDF chamado "Itens mais vendidos" sem uma palavra
 * sobre a Camila nem sobre agosto.
 * ==========================================================================
 */
describe('recorteDoPedido', () => {
  it('a Camila em agosto: quem e quando, nesta ordem', () => {
    const r = recorteDoPedido({
      vendedora: 'camila',
      de: '2026-08-01',
      ate: '2026-08-31',
    });

    expect(r.titulo).toBe('Camila · agosto de 2026');
    expect(r.periodo).toBe('agosto de 2026');
  });

  /* MÊS FECHADO SE DIZ PELO NOME. O modelo consulta por duas pontas porque é
   * assim que se consulta; ninguém lê "01/08 a 31/08" e pensa "agosto". */
  it('o mês inteiro vira o nome do mês, e não as duas pontas', () => {
    expect(recorteDoPedido({ de: '2026-02-01', ate: '2026-02-28' }).periodo).toBe(
      'fevereiro de 2026',
    );
    // Fevereiro de ano bissexto tem 29, e o último dia é o último dia.
    expect(recorteDoPedido({ de: '2024-02-01', ate: '2024-02-29' }).periodo).toBe(
      'fevereiro de 2024',
    );
  });

  it('o ano inteiro vira o ano', () => {
    expect(recorteDoPedido({ de: '2025-01-01', ate: '2025-12-31' }).periodo).toBe(
      '2025',
    );
  });

  it('pedaço de mês sai como intervalo, com o ano uma vez só', () => {
    expect(recorteDoPedido({ de: '2026-08-01', ate: '2026-08-15' }).periodo).toBe(
      '01/08 a 15/08/2026',
    );
    expect(recorteDoPedido({ de: '2025-12-20', ate: '2026-01-10' }).periodo).toBe(
      '20/12/2025 a 10/01/2026',
    );
  });

  it('o período por nome vira português', () => {
    expect(recorteDoPedido({ periodo: 'HOJE' }).periodo).toBe('hoje');
    expect(recorteDoPedido({ periodo: 'MES' }).periodo).toBe('este mês');
    expect(recorteDoPedido({ periodo: 'ANO' }).periodo).toBe('este ano');
  });

  it('o mês sozinho, e o mês com ano', () => {
    expect(recorteDoPedido({ mes: 8 }).periodo).toBe('agosto');
    expect(recorteDoPedido({ mes: 8, ano: 2025 }).periodo).toBe(
      'agosto de 2025',
    );
  });

  /* "Clientes sem comprar há 6 meses": o prazo É o recorte dessa pergunta, e
   * sem ele o papel não diz nada sobre o que está olhando. */
  it('o prazo entra quando é ele que define a pergunta', () => {
    expect(recorteDoPedido({ meses: 6 }).periodo).toBe('últimos 6 meses');
    expect(recorteDoPedido({ meses: 1 }).periodo).toBe('último mês');
    expect(recorteDoPedido({ dias: 90 }).periodo).toBe('últimos 90 dias');
  });

  it('quem · o quê · quando, na ordem da pergunta', () => {
    expect(
      recorteDoPedido({ vendedora: 'ylka', familia: 'BRINCO', periodo: 'MES' })
        .titulo,
    ).toBe('Ylka · brinco · este mês');
  });

  it('o nome vira nome próprio, venha como vier', () => {
    expect(recorteDoPedido({ vendedora: 'camila' }).titulo).toBe('Camila');
    expect(recorteDoPedido({ cliente: 'MARIA DA SILVA' }).titulo).toBe(
      'Maria da Silva',
    );
  });

  /* ======================================================================
   * PERGUNTA SEM RECORTE CONTINUA COMO ERA.
   *
   * Inventar "geral" ou "todos" seria escrever no papel uma informação que
   * ninguém deu — e um título que afirma mais do que a pergunta afirmou é o
   * mesmo defeito das 14:14 de 21/10, por outro caminho.
   * ====================================================================== */
  it('sem recorte, não inventa', () => {
    expect(recorteDoPedido({})).toEqual({ titulo: null, periodo: null });
    expect(recorteDoPedido(undefined)).toEqual({ titulo: null, periodo: null });
    expect(recorteDoPedido(null)).toEqual({ titulo: null, periodo: null });
    expect(recorteDoPedido('camila')).toEqual({ titulo: null, periodo: null });
    expect(recorteDoPedido({ limite: 10 })).toEqual({
      titulo: null,
      periodo: null,
    });
  });

  it('o que não é data não vira período', () => {
    expect(recorteDoPedido({ de: 'agosto', ate: 'setembro' }).periodo).toBeNull();
    expect(recorteDoPedido({ de: '2026-13-01', ate: '2026-13-31' }).periodo).toBeNull();
    expect(recorteDoPedido({ periodo: 'DECADA' }).periodo).toBeNull();
  });

  /* O título é o nome do arquivo no celular dela: linha que não acaba vira
   * nome que não se lê. */
  it('título comprido é cortado, e o corte aparece', () => {
    const r = recorteDoPedido({
      cliente: 'a'.repeat(40),
      familia: 'b'.repeat(40),
    });

    expect(r.titulo!.length).toBeLessThanOrEqual(72);
    expect(r.titulo!.endsWith('…')).toBe(true);
  });
});
