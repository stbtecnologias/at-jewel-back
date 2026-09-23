/**
 * QUANTOS DIAS DE CALENDARIO SEPARAM DUAS DATAS — e nao quantos periodos de
 * 24 horas cabem entre elas.
 *
 * ==========================================================================
 * A DIFERENCA NAO E ACADEMICA: ELA JA MENTIU EM PRODUCAO.
 *
 * Em 22/09/2026 a Elena disse a uma vendedora que um lead tinha "chegado
 * hoje". Ele tinha sido encaminhado as 16:13 do dia ANTERIOR, e a pergunta
 * era as 09:55. Entre os dois instantes passaram 17h42 — menos de um dia —,
 * entao `Math.floor(ms / 86_400_000)` deu zero, e zero estava escrito como
 * "hoje".
 *
 * Para quem le, "hoje" e uma afirmacao sobre o CALENDARIO, nao sobre um
 * intervalo. "Chegou hoje" num lead de ontem faz a vendedora concluir que o
 * dia dela esta em dia quando nao esta — e o erro so aparece quando ela
 * liga para alguem que ja esperou uma noite inteira.
 *
 * A JANELA DE ERRO E ENORME: qualquer marco entre 00:00 e 23:59 de ontem e
 * lido como hoje durante todo o comeco do dia seguinte. Quanto mais tarde o
 * lead chega, por mais tempo ele mente.
 * ==========================================================================
 *
 * Compara MEIA-NOITE COM MEIA-NOITE, no fuso do servidor — que e o fuso em
 * que a pessoa que le a frase vive. E `round`, e nao `floor`, porque a
 * subtracao de duas meias-noites so nao da um multiplo exato de 24h em dia de
 * mudanca de horario; o Brasil nao tem mais, mas o arredondamento e de graca.
 *
 * @returns negativo quando `marco` esta no futuro.
 */
export function diasDeCalendario(marco: Date, agora: Date): number {
  return Math.round((meiaNoite(agora) - meiaNoite(marco)) / 86_400_000);
}

function meiaNoite(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
