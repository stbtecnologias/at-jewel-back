/**
 * O que e "um dia" — uma definicao so, para a casa inteira.
 *
 * ==========================================================================
 * NASCEU EM 29/09/2026 PORQUE IA HAVER DUAS.
 *
 * A linha do tempo ja sabia recortar um dia; o ponteiro de conversas passou a
 * precisar do mesmo recorte para responder "ela falou com alguem hoje?". Duas
 * copias da mesma conta divergem um dia — normalmente no fuso, normalmente
 * depois das 21h — e a divergencia aparece como numeros diferentes para a
 * mesma pergunta, que e o jeito mais caro de descobrir.
 * ==========================================================================
 */

/**
 * `2026-09-08` -> meia-noite LOCAL desse dia.
 *
 * `new Date('2026-09-08')` daria meia-noite em UTC, que aqui e 21h do dia 7 —
 * a tela mostraria o dia anterior a partir das 21h. Por isso os pedacos sao
 * montados a mao.
 */
export function inicioDoDia(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 0, 0, 0, 0);
}

/** Meia-noite de hoje, no fuso do servidor (America/Sao_Paulo). */
export function hoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function somaUmDia(d: Date): Date {
  const fim = new Date(d);
  fim.setDate(fim.getDate() + 1);
  return fim;
}

/**
 * O par `[de, ate)` de um dia. Sem `iso`, hoje.
 *
 * INTERVALO ABERTO NO FIM, e nao `23:59:59`: a mensagem das 23:59:59.4 existe
 * e cairia fora de um fim fechado, sem que ninguem nunca descobrisse.
 */
export function janelaDoDia(iso?: string): { de: Date; ate: Date } {
  const de = iso ? inicioDoDia(iso) : hoje();
  return { de, ate: somaUmDia(de) };
}
