/**
 * Politica de expiracao do refresh token (E8 — reuniao 19/06/2026).
 *
 * Regra de negocio: a sessao deve "funcionar por 3 dias", de modo que:
 *   - um fim de semana normal (acesso na sexta, volta na segunda) NAO desloga;
 *   - um feriadao ou falta na sexta/segunda (gap de 3+ dias) FORCA relogin.
 *
 * Implementacao: o refresh token vale ate o FIM DO DIA (23:59:59.999, fuso de
 * Brasilia) de (hoje + 3 dias), onde "hoje" e o dia-calendario corrente no fuso
 * BR. Usar limite de CALENDARIO (e nao 72h corridas) evita falso-logout em
 * segundas de tarde apos uma sexta de manha.
 *
 * O deslize e idempotente dentro do mesmo dia: qualquer acesso no mesmo dia-BR
 * produz exatamente o mesmo `expires_at` (fim de hoje+3). Logo o efeito pratico
 * e "estende no primeiro acesso do dia, nao estende de novo no resto do dia",
 * sem precisar de gate adicional.
 *
 * Sem dependencia de lib de data: o offset do fuso e obtido via Intl, o que
 * mantem o calculo correto mesmo se o horario de verao voltar ao Brasil.
 */

const BR_TIME_ZONE = 'America/Sao_Paulo';

/** Janela padrao, em dias de calendario, a partir de hoje (BR). */
export const REFRESH_TOKEN_DAYS_AHEAD = 3;

/**
 * Offset do fuso `timeZone` em relacao ao UTC, em milissegundos, para o instante
 * dado. Positivo a leste de Greenwich, negativo a oeste (BR ~ -3h = -10_800_000).
 */
function getTimeZoneOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }

  // Em alguns ambientes a meia-noite vem como hora 24 — normaliza para 0.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const wallClockAsUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    parts.minute,
    parts.second,
  );

  // `formatToParts` trunca em segundos. Comparar contra o instante tambem
  // truncado ao segundo evita que milissegundos "vazem" para o offset (que e
  // sempre multiplo de minuto). Sem isso, instantes com ms != 0 deslocariam o
  // resultado em ate ~1s.
  const instantFlooredToSecond = Math.floor(instant.getTime() / 1000) * 1000;
  return wallClockAsUTC - instantFlooredToSecond;
}

/**
 * Calcula o instante de expiracao do refresh token: fim do dia (fuso BR) de
 * (hoje + `daysAhead` dias). Retorna um `Date` em UTC.
 *
 * @param now      instante de referencia (default: agora). Injetavel p/ testes.
 * @param daysAhead dias de calendario a frente (default: 3).
 */
export function computeRefreshTokenExpiry(
  now: Date = new Date(),
  daysAhead: number = REFRESH_TOKEN_DAYS_AHEAD,
): Date {
  // 1. Descobre o dia-calendario corrente no fuso BR.
  const brWallClock = new Date(now.getTime() + getTimeZoneOffsetMs(BR_TIME_ZONE, now));
  const year = brWallClock.getUTCFullYear();
  const month = brWallClock.getUTCMonth();
  const day = brWallClock.getUTCDate();

  // 2. Fim do dia BR de (hoje + daysAhead), interpretado ingenuamente como UTC.
  const naiveEndOfDayUTC = Date.UTC(year, month, day + daysAhead, 23, 59, 59, 999);

  // 3. Ajusta pelo offset BR naquele instante (DST-safe) para obter o UTC real.
  const offsetAtTarget = getTimeZoneOffsetMs(BR_TIME_ZONE, new Date(naiveEndOfDayUTC));
  return new Date(naiveEndOfDayUTC - offsetAtTarget);
}
