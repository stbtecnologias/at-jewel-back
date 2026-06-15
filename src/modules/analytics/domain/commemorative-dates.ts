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
