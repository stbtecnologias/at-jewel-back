/**
 * O RELOGIO DA LOJA — ANA-14, 29/09/2026.
 *
 * ==========================================================================
 * POR QUE O TEMPO CORRIDO NAO SERVE PARA RANQUEAR VENDEDORA.
 *
 * Cliente escreve 23h40, vendedora responde 8h10 do dia seguinte. Em tempo
 * corrido isso e OITO HORAS E MEIA de demora; no relogio da loja sao DEZ
 * MINUTOS — ela respondeu assim que abriu.
 *
 * Num ranking de "quem responde mais rapido" a diferenca nao desempata:
 * INVERTE. Quem pega as mensagens da madrugada aparece como a pior da equipe
 * justamente por atender cedo, e o numero parece perfeitamente plausivel.
 *
 * O documento pediu as duas contas ("padrao: contar so horario comercial;
 * registrar tambem o tempo corrido"), e a razao e essa: sozinho, nenhum dos
 * dois distingue "demorou" de "chegou fora do horario".
 * ==========================================================================
 *
 * ==========================================================================
 * SETE DIAS POR SEMANA, E ISSO NAO E DESCUIDO.
 *
 * O Lucas, em 29/09/2026: "o horario e das 08 as 19... mas segundo o pessoal,
 * os clientes vem a qualquer hora, sabado e domingo".
 *
 * Excluir o fim de semana criaria o mesmo defeito que a janela resolve, ao
 * contrario: mensagem de sabado 10h respondida 10h05 nao contaria cinco
 * minutos — o relogio so voltaria na segunda, e quem atendeu no sabado
 * apareceria com DOIS DIAS de demora. A vendedora mais dedicada viraria a
 * mais lenta do ranking.
 * ==========================================================================
 *
 * ISTO VIRA CONFIGURACAO NO ANA-20, que ja tera tabela para os prazos dos
 * alertas. Ate la os valores moram aqui, num lugar so, e mudar a janela e
 * mudar duas linhas — nenhum calculo depende dos numeros em si.
 */

/** Hora em que a loja abre (0-23). */
export const ABRE_AS = 8;
/** Hora em que a loja fecha (0-23). */
export const FECHA_AS = 19;

/** Minutos de expediente em um dia inteiro. */
const MINUTOS_POR_DIA = (FECHA_AS - ABRE_AS) * 60;

/**
 * Quantos minutos de EXPEDIENTE existem entre dois instantes.
 *
 * ==========================================================================
 * O CALCULO E POR DIA, E NAO POR SUBTRACAO COM DESCONTO.
 *
 * A tentacao e "subtrai o total e tira as horas fechadas". Isso erra em todo
 * caso de borda — inicio fora do horario, fim fora do horario, os dois no
 * mesmo dia fechado — e os erros sao pequenos o bastante para ninguem notar
 * e grandes o bastante para trocar o primeiro lugar do ranking.
 *
 * Andar dia a dia, somando a interseccao de cada um com o expediente, e mais
 * lento e nao erra. E a quantidade de dias e sempre pequena: uma diferenca de
 * meses aqui significaria que ninguem respondeu, e isso e alerta, nao media.
 * ==========================================================================
 *
 * @returns minutos, nunca negativo. `fim` antes de `inicio` devolve 0.
 */
export function minutosDeExpediente(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;

  // Teto defensivo: mais de um ano de diferenca e dado corrompido, e o laco
  // nao pode virar um problema de desempenho por causa disso.
  const DIAS_MAXIMO = 366;

  let total = 0;
  const dia = new Date(inicio);
  dia.setHours(0, 0, 0, 0);

  for (let i = 0; i <= DIAS_MAXIMO; i++) {
    const abre = new Date(dia);
    abre.setHours(ABRE_AS, 0, 0, 0);
    const fecha = new Date(dia);
    fecha.setHours(FECHA_AS, 0, 0, 0);

    if (abre > fim) break;

    // A interseccao entre [inicio, fim] e o expediente DESTE dia.
    const de = inicio > abre ? inicio : abre;
    const ate = fim < fecha ? fim : fecha;
    if (ate > de) total += (ate.getTime() - de.getTime()) / 60_000;

    dia.setDate(dia.getDate() + 1);
  }

  return Math.round(total);
}

/** Minutos corridos, sem olhar o relogio da loja. */
export function minutosCorridos(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;
  return Math.round((fim.getTime() - inicio.getTime()) / 60_000);
}

/** O instante cai dentro do expediente? */
export function dentroDoExpediente(quando: Date): boolean {
  const h = quando.getHours();
  return h >= ABRE_AS && h < FECHA_AS;
}

/**
 * O expediente de um dia inteiro, para quem precisa do denominador.
 *
 * Exportado para o teste poder afirmar a relacao entre as duas contas sem
 * repetir os numeros — se a janela mudar, o teste acompanha.
 */
export const MINUTOS_DE_EXPEDIENTE_POR_DIA = MINUTOS_POR_DIA;
