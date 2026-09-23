import { diasDeCalendario } from './dias-de-calendario';

/**
 * O CASO QUE ESTES TESTES EXISTEM PARA IMPEDIR, e ele aconteceu:
 *
 *   22/09/2026, 09:55 — a Elena responde "Tem um lead sim, Lucas: Aslan ...
 *   chegou hoje". O lead tinha sido encaminhado as 16:13 do dia 21.
 *
 * Passaram 17h42 entre os dois instantes, e `Math.floor(17h42 / 24h)` e zero.
 * Zero estava escrito como "hoje". A conta certa nao e de intervalo, e de
 * calendario: entre 21 e 22 ha um virar de dia, e ponto.
 */
describe('diasDeCalendario', () => {
  it('ontem as 16h, visto as 09h de hoje, e UM dia — e nao zero', () => {
    const marco = new Date(2026, 8, 21, 16, 13);
    const agora = new Date(2026, 8, 22, 9, 55);

    // 17h42 de intervalo. A conta velha dava 0.
    expect((agora.getTime() - marco.getTime()) / 3_600_000).toBeCloseTo(17.7, 1);
    expect(diasDeCalendario(marco, agora)).toBe(1);
  });

  it('a virada de meia-noite ja conta, mesmo com um minuto de diferenca', () => {
    expect(
      diasDeCalendario(
        new Date(2026, 8, 21, 23, 59),
        new Date(2026, 8, 22, 0, 1),
      ),
    ).toBe(1);
  });

  it('o mesmo dia e zero, do primeiro ao ultimo minuto', () => {
    const agora = new Date(2026, 8, 22, 23, 59);
    expect(diasDeCalendario(new Date(2026, 8, 22, 0, 0), agora)).toBe(0);
    expect(diasDeCalendario(agora, agora)).toBe(0);
  });

  it('atravessa a virada do mes', () => {
    expect(
      diasDeCalendario(new Date(2026, 7, 31, 20, 0), new Date(2026, 8, 1, 8, 0)),
    ).toBe(1);
  });

  it('marco no futuro devolve negativo, e nao um numero grande', () => {
    expect(
      diasDeCalendario(new Date(2026, 8, 23, 8, 0), new Date(2026, 8, 22, 20, 0)),
    ).toBe(-1);
  });
});
