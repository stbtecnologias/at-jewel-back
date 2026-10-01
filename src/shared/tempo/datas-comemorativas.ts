// Datas comemorativas relevantes para joalheria, calculadas por ano.
// Inclui datas fixas, "N-esimo domingo" (Maes/Pais) e moveis (Pascoa/Carnaval).

export interface DataComemorativa {
  nome: string;
  data: Date; // data do evento (no fuso local do servidor)
}

// Domingo de Pascoa (algoritmo de Meeus/Gregoriano anonimo).
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3=marco, 4=abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

// N-esimo (1..5) domingo de um mes (mes: 1=jan).
function nesimoDomingo(ano: number, mes: number, n: number): Date {
  const primeiro = new Date(ano, mes - 1, 1);
  const offset = (7 - primeiro.getDay()) % 7; // dias ate o 1o domingo
  return new Date(ano, mes - 1, 1 + offset + (n - 1) * 7);
}

export function datasComemorativas(ano: number): DataComemorativa[] {
  const domingoPascoa = pascoa(ano);
  const carnaval = new Date(domingoPascoa);
  carnaval.setDate(carnaval.getDate() - 47); // terca de carnaval

  return [
    { nome: 'Carnaval', data: carnaval },
    { nome: 'Páscoa', data: domingoPascoa },
    { nome: 'Dia das Mães', data: nesimoDomingo(ano, 5, 2) },
    { nome: 'Dia dos Namorados', data: new Date(ano, 5, 12) },
    { nome: 'Dia dos Pais', data: nesimoDomingo(ano, 8, 2) },
    { nome: 'Natal', data: new Date(ano, 11, 25) },
  ];
}

/**
 * OS SEIS NOMES, PARA QUEM PRECISA OFERECE-LOS NUMA LISTA — 01/10/2026.
 *
 * O schema da ferramenta `clientes_por_epoca` enumera estes valores, entao a
 * lista e a mesma do calculo: nome novo aqui aparece la sem ninguem lembrar.
 */
export const NOMES_COMEMORATIVOS = [
  'Carnaval',
  'Páscoa',
  'Dia das Mães',
  'Dia dos Namorados',
  'Dia dos Pais',
  'Natal',
] as const;

export type NomeComemorativo = (typeof NOMES_COMEMORATIVOS)[number];

/**
 * QUINZE DIAS ANTES ATE O DIA — decisao do Lucas em 01/10/2026.
 *
 * E a mesma janela do grafico de datas comemorativas do Analytics. Para joia
 * faz sentido: a compra acontece ANTES da data, nao nela.
 */
export const DIAS_ANTES_DA_DATA = 15;

export interface JanelaDeEpoca {
  de: Date;
  ate: Date;
}

/** Os `quantos` ultimos anos, incluindo o de hoje, do mais antigo para o mais novo. */
export function anosRecentes(quantos: number, hoje = new Date()): number[] {
  const atual = hoje.getFullYear();
  return Array.from({ length: quantos }, (_, i) => atual - (quantos - 1 - i));
}

/**
 * O mes inteiro, em cada ano — "quem mais compra em outubro".
 *
 * Uma janela por ano, e nao um `to_char(data,'MM')`, porque quem consome isto
 * recebe SEMPRE uma lista de janelas: mes e data comemorativa viram a mesma
 * consulta, e o SQL nao precisa saber qual das duas perguntas foi feita.
 */
export function janelasDoMes(mes: number, anos: number[]): JanelaDeEpoca[] {
  return anos.map((ano) => ({
    de: new Date(ano, mes - 1, 1, 0, 0, 0, 0),
    // Dia 0 do mes seguinte = ultimo dia deste mes. Vale para fevereiro
    // bissexto sem ninguem precisar saber que ele existe.
    ate: new Date(ano, mes, 0, 23, 59, 59, 999),
  }));
}

/**
 * Os 15 dias que antecedem a data, em cada ano — "quem compra no Natal".
 *
 * A DATA E CALCULADA POR ANO, e por isso as moveis funcionam: a Pascoa de 2024
 * caiu em 31/03 e a de 2025 em 20/04; o Dia das Maes e o 2o domingo de maio, e
 * muda de dia todo ano. Uma janela fixa de MM-DD erraria as tres.
 */
export function janelasDaDataComemorativa(
  nome: NomeComemorativo,
  anos: number[],
): JanelaDeEpoca[] {
  const janelas: JanelaDeEpoca[] = [];
  for (const ano of anos) {
    const data = datasComemorativas(ano).find((d) => d.nome === nome);
    if (!data) continue;
    const de = new Date(data.data);
    de.setDate(de.getDate() - DIAS_ANTES_DA_DATA);
    de.setHours(0, 0, 0, 0);
    const ate = new Date(data.data);
    ate.setHours(23, 59, 59, 999);
    janelas.push({ de, ate });
  }
  return janelas;
}
