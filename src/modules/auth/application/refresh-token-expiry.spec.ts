import {
  computeRefreshTokenExpiry,
  REFRESH_TOKEN_DAYS_AHEAD,
} from './refresh-token-expiry';

/**
 * BR = America/Sao_Paulo, atualmente UTC-3 (sem horario de verao desde 2019).
 * Logo o fim do dia BR (23:59:59.999) corresponde a 02:59:59.999 UTC do dia
 * seguinte. Os testes usam datas reais (sexta/segunda/terca) para validar a
 * regra de negocio do gap de 3 dias.
 */

// Helper: instante UTC correspondente a uma hora local BR (UTC-3).
function brToUtc(
  year: number,
  month: number,
  day: number,
  hour = 9,
  minute = 0,
): Date {
  // BR local + 3h = UTC.
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
}

describe('computeRefreshTokenExpiry', () => {
  it('expira no fim do dia BR de (hoje + 3 dias)', () => {
    // Sexta-feira, 19/06/2026, 09:00 BR.
    const sextaManha = brToUtc(2026, 6, 19, 9);
    const expiry = computeRefreshTokenExpiry(sextaManha);

    // Esperado: fim do dia de 22/06 (segunda) em BR = 23/06 02:59:59.999 UTC.
    expect(expiry.toISOString()).toBe('2026-06-23T02:59:59.999Z');
  });

  it('mantem logado em fim de semana normal (sexta -> segunda)', () => {
    // Ultimo acesso sexta 19/06 09:00; volta segunda 22/06 14:00.
    const sexta = brToUtc(2026, 6, 19, 9);
    const segunda = brToUtc(2026, 6, 22, 14);

    const expiry = computeRefreshTokenExpiry(sexta);
    // Na segunda o token ainda esta valido -> nao desloga.
    expect(segunda.getTime()).toBeLessThanOrEqual(expiry.getTime());
  });

  it('forca relogin em feriadao (sexta -> terca, sem acesso na segunda)', () => {
    // Ultimo acesso sexta 19/06; volta so terca 23/06 (segunda foi feriado).
    const sexta = brToUtc(2026, 6, 19, 9);
    const terca = brToUtc(2026, 6, 23, 9);

    const expiry = computeRefreshTokenExpiry(sexta);
    // Na terca o token ja expirou -> relogin.
    expect(terca.getTime()).toBeGreaterThan(expiry.getTime());
  });

  it('forca relogin quando falta na sexta (quinta -> segunda)', () => {
    // Ultimo acesso quinta 18/06; volta segunda 22/06 (faltou sexta).
    const quinta = brToUtc(2026, 6, 18, 9);
    const segunda = brToUtc(2026, 6, 22, 9);

    const expiry = computeRefreshTokenExpiry(quinta);
    // Quinta + 3 = domingo; na segunda ja expirou -> relogin.
    expect(segunda.getTime()).toBeGreaterThan(expiry.getTime());
  });

  it('e idempotente dentro do mesmo dia-BR (estende 1x/dia na pratica)', () => {
    // Dois acessos no mesmo dia, manha e noite, produzem a mesma expiracao.
    const manha = brToUtc(2026, 6, 19, 8);
    const noite = brToUtc(2026, 6, 19, 22);

    expect(computeRefreshTokenExpiry(manha).getTime()).toBe(
      computeRefreshTokenExpiry(noite).getTime(),
    );
  });

  it('respeita a fronteira de dia no fuso BR, nao no UTC', () => {
    // 19/06 23:30 BR = 20/06 02:30 UTC. O "hoje" deve ser 19/06 (BR), nao 20/06.
    const quaseMeiaNoiteBR = brToUtc(2026, 6, 19, 23, 30);
    const expiry = computeRefreshTokenExpiry(quaseMeiaNoiteBR);

    // hoje(BR)=19/06 -> +3 = 22/06 -> fim do dia = 23/06 02:59:59.999 UTC.
    expect(expiry.toISOString()).toBe('2026-06-23T02:59:59.999Z');
  });

  it('usa 3 dias como janela padrao', () => {
    expect(REFRESH_TOKEN_DAYS_AHEAD).toBe(3);
  });
});
