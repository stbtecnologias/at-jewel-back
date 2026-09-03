/**
 * Converte uma data/hora vinda do ERP Safira em instante absoluto.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 *
 * O dump de 03/09/2026 mostrou que o Safira manda data SEM FUSO:
 *
 *   "2026-08-05T12:51:22"    venda das 12h51
 *   "2026-08-08T00:00:00"    documento so com data, hora zerada
 *
 * Nossas colunas sao TIMESTAMPTZ, e `new Date("2026-08-05T12:51:22")` no Node
 * interpreta a string como HORA LOCAL DO PROCESSO. O container roda em UTC —
 * a venda das 12h51 da loja viraria 12h51Z, que e 09h51 em Fortaleza. Tres
 * horas de erro em todo relatorio por periodo.
 *
 * E o erro nao e uniforme: nas duas movimentacoes que chegam a meia-noite
 * exata (1308414 e 1319802), o deslocamento joga o documento para o DIA
 * ANTERIOR. Fechamento de mes muda de resultado por causa disso.
 *
 * ============================================================================
 * COMO RESOLVE
 *
 * String sem fuso e lida como hora de parede do FUSO DA LOJA. String que ja
 * traz `Z` ou `+HH:MM` e respeitada como veio — se um dia ele passar a mandar
 * o fuso, esta funcao para de adivinhar sozinha.
 *
 * O deslocamento e calculado pelo `Intl` para o proprio instante, nao chumbado
 * em -03:00. O Brasil nao tem horario de verao desde 2019, entao hoje da na
 * mesma; a diferenca aparece se ele voltar, e o custo de fazer certo agora e
 * uma chamada de `Intl.DateTimeFormat`.
 *
 * O `Intl` funciona em container Alpine mesmo sem `tzdata` instalado: o Node
 * carrega o ICU proprio, e e por isso que `date` mente no shell e o Node nao.
 * ============================================================================
 */

/**
 * O fuso da operacao — o mesmo valor que `venda.repository.ts` ja usa para
 * agrupar venda por dia. Manter os dois iguais e o que importa: se divergirem,
 * o documento entra num dia e o relatorio o conta noutro.
 *
 * DIVERGENCIA CONHECIDA, e hoje inofensiva: o container de producao sobe com
 * `TZ=America/Fortaleza` (ver .gitlab-ci.yml), que e onde a loja fica. Sao
 * Paulo e Fortaleza estao os dois em -03:00 e nenhum tem horario de verao
 * desde 2019, entao dao o mesmo resultado. Se um dia o horario de verao
 * voltar, ele volta so para o Sudeste — e ai as duas constantes precisam ser
 * unificadas em Fortaleza, nas duas pontas de uma vez.
 */
export const FUSO_DA_LOJA = 'America/Sao_Paulo';

/** `Z`, `+03:00`, `-0300` no fim da string. */
const TEM_FUSO = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Deslocamento do fuso, em minutos, no instante dado.
 *
 * Formata o instante no fuso alvo, le os campos de volta como se fossem UTC e
 * mede a diferenca. E o jeito de descobrir o offset com o que existe no
 * runtime, sem tabela propria.
 */
function deslocamentoEmMinutos(instante: Date, fuso: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const campos: Record<string, number> = {};
  for (const parte of fmt.formatToParts(instante)) {
    if (parte.type !== 'literal') campos[parte.type] = Number(parte.value);
  }

  // `hour12: false` devolve 24 para a meia-noite em algumas versoes do ICU.
  const hora = campos.hour === 24 ? 0 : campos.hour;

  const comoSeFosseUtc = Date.UTC(
    campos.year,
    campos.month - 1,
    campos.day,
    hora,
    campos.minute,
    campos.second,
  );

  return (comoSeFosseUtc - instante.getTime()) / 60_000;
}

/**
 * Le a data do ERP como hora de parede do fuso da loja.
 *
 * Devolve `null` para entrada vazia ou impossivel de interpretar — quem chama
 * decide se isso e erro. Nesta integracao e: `data_movimentacao` e NOT NULL.
 */
export function dataDoErp(
  valor: string | Date | null | undefined,
  fuso: string = FUSO_DA_LOJA,
): Date | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  const texto = valor.trim();
  if (texto === '') return null;

  // Ja veio com fuso: respeitar o que foi dito, nao adivinhar.
  if (TEM_FUSO.test(texto)) {
    const comFuso = new Date(texto);
    return Number.isNaN(comFuso.getTime()) ? null : comFuso;
  }

  // Sem fuso: ler os campos como hora de parede. `Date.parse` com sufixo Z
  // trata a string como UTC, que e o ponto de partida da conversao.
  const tentativa = Date.parse(`${texto}Z`);
  if (Number.isNaN(tentativa)) return null;

  // Primeira aproximacao: tira o deslocamento medido no proprio palpite.
  const desloc1 = deslocamentoEmMinutos(new Date(tentativa), fuso);
  const instante = new Date(tentativa - desloc1 * 60_000);

  // Uma correcao. Ela so muda alguma coisa quando o palpite caiu do outro lado
  // de uma virada de horario de verao — hoje impossivel no Brasil, e barato o
  // bastante para nao depender disso continuar verdade.
  const desloc2 = deslocamentoEmMinutos(instante, fuso);
  if (desloc2 === desloc1) return instante;

  return new Date(tentativa - desloc2 * 60_000);
}
