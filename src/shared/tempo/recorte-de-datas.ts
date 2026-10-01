/** `AAAA-MM-DD` — o formato que o modelo manda, e o unico que se aceita. */
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * As datas de um recorte livre, ou `null` para cair no atalho — 28/09/2026.
 *
 * ==========================================================================
 * UM PARSER SO PARA AS DUAS AGENTES.
 *
 * Nasceu dentro do `FerramentasGestaoService` e saiu para ca no mesmo dia,
 * quando a vendedora tambem passou a poder pedir periodo livre. Duas copias
 * responderiam igual hoje e divergiriam na primeira correcao feita de um lado
 * so — e aqui "divergir" significa a MESMA pergunta devolvendo periodos
 * diferentes conforme quem pergunta.
 * ==========================================================================
 *
 * QUEM PREENCHE ISTO E O MODELO, convertendo "ultimos 6 meses" em datas. Ele
 * acerta quase sempre — ja e assim que ele agenda "amanha as 17h" — e "quase"
 * e o motivo desta funcao existir.
 *
 * `null` EM QUALQUER DUVIDA, e isso e deliberado: cair no atalho devolve um
 * periodo errado mas EXPLICADO, porque a agente diz qual recorte usou;
 * aceitar uma data torta devolve um periodo errado e MUDO. Entre os dois, o
 * que se percebe.
 *
 * O que derruba para `null`:
 *   - uma das duas faltando — meia janela nao e janela
 *   - formato fora de `AAAA-MM-DD`
 *   - data que nao existe (`new Date('2026-02-31')` vira 3 de marco, CALADO)
 *   - inicio depois do fim — invertido, o SQL devolveria vazio sem dizer nada
 *
 * O FIM E O DIA INTEIRO: quem consome passa por `fimDoDia` no
 * `ConsultarVendasUseCase`. "De 01/08 a 31/08" tem de incluir o dia 31, e uma
 * janela que para a meia-noite perderia um dia de faturamento todo mes.
 */
export function datasDeRecorte(
  de?: string,
  ate?: string,
): { de: Date; ate: Date } | null {
  if (!de || !ate) return null;

  const ini = dataOuNulo(de);
  const fim = dataOuNulo(ate);
  if (!ini || !fim || ini > fim) return null;

  return { de: ini, ate: fim };
}

function dataOuNulo(texto: string): Date | null {
  const m = RE_DATA.exec(texto.trim());
  if (!m) return null;

  const [, ano, mes, dia] = m;
  const d = new Date(`${ano}-${mes}-${dia}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  // O `new Date` NORMALIZA em silencio: "2026-02-31" vira 3 de marco. Comparar
  // o dia e o mes de volta e o que pega isso — sem estas duas linhas, uma data
  // impossivel viraria uma janela plausivel e ninguem notaria.
  return d.getDate() === Number(dia) && d.getMonth() + 1 === Number(mes)
    ? d
    : null;
}

/** O padrao de "faz tempo" quando ela nao diz quanto. Era o default do schema. */
const MESES_PADRAO = 6;

/**
 * A DATA DE CORTE de "quem nao compra desde..." — 01/10/2026.
 *
 * ==========================================================================
 * TRES FORMAS DE DIZER A MESMA COISA.
 *
 * Ate hoje a ferramenta so aceitava MESES, inteiro e obrigatorio: "ha 45 dias"
 * e "desde julho" nao tinham como chegar — o modelo arredondava para 1 ou 2
 * meses, e a resposta vinha de um recorte que ninguem pediu.
 * ==========================================================================
 *
 * A ORDEM E DA MAIS ESPECIFICA PARA A MENOS: uma data dita e mais precisa que
 * "45 dias", que e mais precisa que "uns meses". Se vierem duas, vale a que
 * carrega mais informacao — e nao a primeira que o modelo escreveu.
 *
 * NUNCA DEVOLVE `null`. Diferente do `datasDeRecorte`, aqui nao existe "janela
 * invalida": a pergunta "quem esta parado" tem resposta com qualquer corte, e
 * o padrao de seis meses e o que a ferramenta ja usava. Cair no padrao e
 * explicavel; recusar a pergunta nao e.
 */
export function dataDeCorte(
  entrada: { meses?: number; dias?: number; desde?: string },
  agora: Date = new Date(),
): Date {
  const data = entrada.desde ? dataOuNulo(entrada.desde) : null;
  if (data) return data;

  const corte = new Date(agora);
  if (entrada.dias && entrada.dias > 0) {
    corte.setDate(corte.getDate() - entrada.dias);
    return corte;
  }

  const meses = entrada.meses && entrada.meses > 0 ? entrada.meses : MESES_PADRAO;
  corte.setMonth(corte.getMonth() - meses);
  return corte;
}
