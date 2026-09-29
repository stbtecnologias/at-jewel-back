import { Inject, Injectable } from '@nestjs/common';
import {
  VENDAS_MOVIMENTACAO_REPOSITORY,
  type IVendasMovimentacaoRepository,
  type ResumoDeVendas,
} from '../../domain/ports/repositories/vendas-movimentacao-repository.port';

/** O atalho que quem pergunta usa. */
export type RecorteComparavel = 'SEMANA' | 'MES' | 'ANO';

export interface LadoDaComparacao {
  de: Date;
  ate: Date;
  clientes: number;
  vendas: number;
  receita: number;
  ticketMedio: number;
}

export interface ComparacaoComAnterior {
  rotulo: string;
  atual: LadoDaComparacao;
  anterior: LadoDaComparacao;
  /**
   * O período anterior FECHADO, quando o atual ainda está correndo.
   *
   * `null` quando não houve corte. Existe porque "o mês passado inteiro deu
   * quanto?" é a pergunta seguinte, sempre — e sem ela a comparação justa
   * (recorte contra recorte) parece esconder o número que a gestão conhece.
   */
  anteriorFechado: LadoDaComparacao | null;
}

/**
 * ESTE PERIODO CONTRA O ANTERIOR — 29/09/2026.
 *
 * ==========================================================================
 * OUTRO EIXO, E POR ISSO OUTRA FERRAMENTA.
 *
 * `CompararAnosUseCase` responde "setembro deste ano contra os setembros
 * anteriores". Esta responde "esta semana contra a semana passada". As duas
 * perguntas se parecem e sao diferentes, e junta-las numa ferramenta so faria
 * o modelo escolher errado metade das vezes — porque a escolha dependeria de
 * uma palavra ("ano", "passada") que nem sempre aparece.
 * ==========================================================================
 *
 * ==========================================================================
 * O RECORTE CORRENTE E PARCIAL, E O ANTERIOR PRECISA SER CORTADO IGUAL.
 *
 * Hoje e terca. "Este mes" tem 29 dias; o mes passado teve 30. Comparar
 * direto diria que a loja caiu, todo mes, sem excecao — e o erro e maior no
 * comeco: no dia 2, a queda aparente seria de 93%.
 *
 * Entao o periodo anterior e cortado no MESMO tamanho, e o total fechado dele
 * vai junto. E a mesma decisao da comparacao entre anos, pelo mesmo motivo.
 * ==========================================================================
 */
@Injectable()
export class CompararPeriodoAnteriorUseCase {
  constructor(
    @Inject(VENDAS_MOVIMENTACAO_REPOSITORY)
    private readonly vendas: IVendasMovimentacaoRepository,
  ) {}

  async porRecorte(
    recorte: RecorteComparavel,
    vendedoraId: string | null = null,
    agora: Date = new Date(),
  ): Promise<ComparacaoComAnterior> {
    const { atual, anterior, fechado, rotulo } = janelas(recorte, agora);

    return this.montar(rotulo, atual, anterior, fechado, vendedoraId);
  }

  /**
   * Datas soltas: o anterior é o MESMO TAMANHO imediatamente antes.
   *
   * "De 01/09 a 15/09" (15 dias) compara com "de 17/08 a 31/08". Não com o
   * mês anterior nem com o ano anterior — quem deu datas quer aquele tamanho.
   */
  async porDatas(
    de: Date,
    ate: Date,
    vendedoraId: string | null = null,
  ): Promise<ComparacaoComAnterior> {
    const fim = fimDoDia(ate);
    const duracao = fim.getTime() - de.getTime();

    const anterior = {
      de: new Date(de.getTime() - duracao - 1),
      ate: new Date(de.getTime() - 1),
    };

    return this.montar(
      `${dm(de)} a ${dm(ate)}`,
      { de, ate: fim },
      anterior,
      null,
      vendedoraId,
    );
  }

  private async montar(
    rotulo: string,
    atual: { de: Date; ate: Date },
    anterior: { de: Date; ate: Date },
    fechado: { de: Date; ate: Date } | null,
    vendedoraId: string | null,
  ): Promise<ComparacaoComAnterior> {
    // As tres leituras sao independentes: o tempo da resposta e o da mais
    // lenta, e nao a soma.
    const [a, b, c] = await Promise.all([
      this.vendas.resumo(atual, vendedoraId),
      this.vendas.resumo(anterior, vendedoraId),
      fechado ? this.vendas.resumo(fechado, vendedoraId) : Promise.resolve(null),
    ]);

    return {
      rotulo,
      atual: lado(atual, a),
      anterior: lado(anterior, b),
      anteriorFechado: c && fechado ? lado(fechado, c) : null,
    };
  }
}

function lado(j: { de: Date; ate: Date }, r: ResumoDeVendas): LadoDaComparacao {
  return {
    de: j.de,
    ate: j.ate,
    clientes: r.clientes,
    vendas: r.quantidade,
    receita: Math.round(r.receita),
    ticketMedio: Math.round(r.ticketMedio),
  };
}

/**
 * As janelas de cada recorte, e a do anterior equivalente.
 *
 * ==========================================================================
 * SEMANA E ROLANTE; MES E ANO SAO DE CALENDARIO. E ISSO MUDA O CORTE.
 *
 * `SEMANA` sao sete dias contando hoje — a convencao que o resto do sistema
 * ja usa. Como os dois lados tem sete dias cheios, nao ha parcial nem corte:
 * a comparacao e justa por construcao.
 *
 * `MES` e `ANO` sao do calendario (dia 1, janeiro 1), porque e assim que a
 * gestao compara com a meta. Ai o atual E parcial, e o anterior tem de ser
 * cortado no mesmo ponto — com o fechado indo junto.
 * ==========================================================================
 */
function janelas(recorte: RecorteComparavel, agora: Date) {
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  if (recorte === 'SEMANA') {
    const de = new Date(inicioDoDia);
    de.setDate(de.getDate() - 6);

    const anteriorDe = new Date(de);
    anteriorDe.setDate(anteriorDe.getDate() - 7);
    const anteriorAte = new Date(de);
    anteriorAte.setMilliseconds(-1);

    return {
      rotulo: 'os últimos 7 dias',
      atual: { de, ate: agora },
      anterior: { de: anteriorDe, ate: anteriorAte },
      // Sem corte: os dois lados tem sete dias cheios.
      fechado: null,
    };
  }

  if (recorte === 'MES') {
    const de = new Date(inicioDoDia);
    de.setDate(1);

    const anteriorDe = new Date(de);
    anteriorDe.setMonth(anteriorDe.getMonth() - 1);

    // O MESMO DIA do mes passado, ate a mesma hora.
    const anteriorAte = new Date(agora);
    anteriorAte.setMonth(anteriorAte.getMonth() - 1);

    // O mes passado INTEIRO: do dia 1 ate o ultimo, que `setDate(0)` devolve
    // sem eu precisar saber quantos dias ele tinha.
    const fechadoAte = new Date(de);
    fechadoAte.setMilliseconds(-1);

    return {
      rotulo: 'este mês',
      atual: { de, ate: agora },
      anterior: { de: anteriorDe, ate: anteriorAte },
      fechado: { de: anteriorDe, ate: fechadoAte },
    };
  }

  const de = new Date(inicioDoDia);
  de.setMonth(0, 1);

  const anteriorDe = new Date(de);
  anteriorDe.setFullYear(anteriorDe.getFullYear() - 1);

  const anteriorAte = new Date(agora);
  anteriorAte.setFullYear(anteriorAte.getFullYear() - 1);

  const fechadoAte = new Date(de);
  fechadoAte.setMilliseconds(-1);

  return {
    rotulo: 'este ano',
    atual: { de, ate: agora },
    anterior: { de: anteriorDe, ate: anteriorAte },
    fechado: { de: anteriorDe, ate: fechadoAte },
  };
}

/** Datas soltas chegam como meia-noite; o fim tem de abraçar o dia inteiro. */
function fimDoDia(d: Date): Date {
  const f = new Date(d);
  if (
    f.getHours() === 0 &&
    f.getMinutes() === 0 &&
    f.getSeconds() === 0 &&
    f.getMilliseconds() === 0
  ) {
    f.setHours(23, 59, 59, 999);
  }
  return f;
}

const dm = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * A variação entre os dois lados, em pontos percentuais inteiros.
 *
 * `null` quando não há base: dividir por zero daria `Infinity`. Um período
 * que começou do zero merece "não houve venda no período anterior", e não um
 * número que parece dado.
 */
export function variacaoEntre(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}
