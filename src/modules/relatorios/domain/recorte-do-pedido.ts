/**
 * O RECORTE DA PERGUNTA, POR EXTENSO — 26/10/2026.
 *
 * ==========================================================================
 * O ARQUIVO SAIU SEM DIZER DE QUEM ERA NEM DE QUANDO.
 *
 *   — "quais peças mais vendidas da Camila em agosto 2026"
 *   — (a lista, certa, com as seis peças)
 *   — "gera o pdf"
 *   — (o PDF, com o título "Itens mais vendidos" e mais nada)
 *
 * *"Sinta falta dos dados, pq são os itens mais vendidos da Camila em Agosto
 * de 2026 e no documento não consta nada disso."*
 *
 * O `tituloDaFerramenta` conhece a FERRAMENTA e não conhece a PERGUNTA: ele
 * dá o mesmo "Itens mais vendidos" para agosto da Camila e para hoje da loja.
 * O recorte estava no pedido do modelo e era descartado no caminho.
 * ==========================================================================
 *
 * E ISTO JÁ ESTAVA DECIDIDO, em 21/10, quando saíram os subtítulos e os chips:
 *
 *   "O recorte, quando existir de verdade, vai no TÍTULO, que é onde quem lê
 *    procura: 'Vendas de outubro', e não 'Vendas' com um chip embaixo."
 *
 * O molde estava certo; o que nunca foi preenchido é o recorte. Por isso ele
 * entra no título — e não numa segunda linha que repita o que o título diz.
 *
 * O QUE ENTRA, E NESTA ORDEM: quem · o quê · quando. "Camila · brinco ·
 * agosto de 2026". É a ordem em que a pergunta foi feita.
 *
 * O NOME É O QUE FOI PEDIDO, e não o nome resolvido no cadastro: "camila"
 * vira "Camila", e não "Camila Brito". Pegar o resolvido exigiria tocar nas
 * vinte ferramentas; o pedido já está aqui, de graça, e é o que ela leu na
 * tela.
 */

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const PERIODOS: Record<string, string> = {
  HOJE: 'hoje',
  ONTEM: 'ontem',
  SEMANA: 'esta semana',
  MES: 'este mês',
  ANO: 'este ano',
};

export interface RecorteDoPedido {
  /** "Camila · agosto de 2026" — vai depois do travessão, no título. */
  titulo: string | null;
  /** "agosto de 2026" — o pedaço de tempo, sozinho, para o carimbo. */
  periodo: string | null;
}

const SEM_RECORTE: RecorteDoPedido = { titulo: null, periodo: null };

/**
 * Lê o pedido que o modelo mandou para a ferramenta e devolve o recorte.
 *
 * PERGUNTA SEM RECORTE CONTINUA COMO ERA: devolve `null` nos dois campos, e
 * quem chama mantém o título e o carimbo de hoje. Inventar "geral" ou "todos"
 * seria escrever no papel uma informação que ninguém deu.
 */
export function recorteDoPedido(pedido: unknown): RecorteDoPedido {
  if (!pedido || typeof pedido !== 'object') return SEM_RECORTE;
  const p = pedido as Record<string, unknown>;

  const quem =
    nomeProprio(palavra(p.cliente) ?? palavra(p.vendedora)) ??
    (palavra(p.documento) ? `doc ${palavra(p.documento)}` : null);

  const oQue = minusculo(
    palavra(p.familia) ??
      palavra(p.categoria) ??
      palavra(p.dataComemorativa) ??
      palavra(p.status) ??
      palavra(p.etapa),
  );

  const periodo = periodoPorExtenso(p);

  const partes = [quem, oQue, periodo].filter((x): x is string => !!x);
  if (partes.length === 0) return SEM_RECORTE;

  return { titulo: cortar(partes.join(' · '), 72), periodo };
}

/** "agosto de 2026" vira "Agosto de 2026" — para começar o carimbo. */
export function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function periodoPorExtenso(p: Record<string, unknown>): string | null {
  const de = palavra(p.de);
  const ate = palavra(p.ate);
  if (de && ate) {
    const intervalo = porIntervalo(de, ate);
    if (intervalo) return intervalo;
  }

  const mes = inteiro(p.mes);
  if (mes && mes >= 1 && mes <= 12) {
    const ano = inteiro(p.ano);
    return ano ? `${MESES[mes - 1]} de ${ano}` : MESES[mes - 1];
  }

  const periodo = palavra(p.periodo);
  if (periodo && PERIODOS[periodo.toUpperCase()]) {
    return PERIODOS[periodo.toUpperCase()];
  }

  // "Clientes sem comprar há 6 meses" — o prazo É o recorte dessa pergunta.
  const meses = inteiro(p.meses) ?? inteiro(p.ultimosMeses);
  if (meses) return meses === 1 ? 'último mês' : `últimos ${meses} meses`;

  const dias = inteiro(p.dias);
  if (dias) return dias === 1 ? 'último dia' : `últimos ${dias} dias`;

  return null;
}

/**
 * MÊS FECHADO SE DIZ PELO NOME, e não pelas duas pontas.
 *
 * O modelo manda "agosto de 2026" como `de: 2026-08-01, ate: 2026-08-31`, que
 * é o jeito certo de consultar e o jeito errado de escrever num papel. Quem
 * lê procura "agosto", não "01/08 a 31/08".
 */
function porIntervalo(de: string, ate: string): string | null {
  const d = emData(de);
  const a = emData(ate);
  if (!d || !a) return null;

  const ultimoDoMes = new Date(Date.UTC(a.ano, a.mes, 0)).getUTCDate();
  const mesmoMes = d.ano === a.ano && d.mes === a.mes;

  if (mesmoMes && d.dia === 1 && a.dia === ultimoDoMes) {
    return `${MESES[d.mes - 1]} de ${d.ano}`;
  }
  if (
    d.ano === a.ano &&
    d.mes === 1 &&
    d.dia === 1 &&
    a.mes === 12 &&
    a.dia === 31
  ) {
    return String(d.ano);
  }

  const dia = (x: { dia: number; mes: number }) =>
    `${dois(x.dia)}/${dois(x.mes)}`;
  return d.ano === a.ano
    ? `${dia(d)} a ${dia(a)}/${a.ano}`
    : `${dia(d)}/${d.ano} a ${dia(a)}/${a.ano}`;
}

function emData(
  texto: string,
): { ano: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

/** Texto que serve: string não vazia, cortada. Número vira texto (documento). */
function palavra(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const limpo = v.trim();
  return limpo ? cortar(limpo, 40) : null;
}

function inteiro(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** "camila" vira "Camila"; "CAMILA BRITO" vira "Camila Brito". */
function nomeProprio(nome: string | null): string | null {
  if (!nome) return null;
  return nome
    .split(/\s+/)
    .map((p) =>
      p.length <= 2
        ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    )
    .join(' ');
}

/** Família e categoria vêm em caixa alta do ERP: "BRINCO" vira "brinco". */
function minusculo(texto: string | null): string | null {
  return texto ? texto.toLowerCase() : null;
}

function cortar(texto: string, teto: number): string {
  return texto.length <= teto ? texto : `${texto.slice(0, teto - 1).trimEnd()}…`;
}

function dois(n: number): string {
  return String(n).padStart(2, '0');
}
