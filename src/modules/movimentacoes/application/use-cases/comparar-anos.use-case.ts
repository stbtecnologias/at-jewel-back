import { Inject, Injectable } from '@nestjs/common';
import {
  VENDAS_MOVIMENTACAO_REPOSITORY,
  type IVendasMovimentacaoRepository,
} from '../../domain/ports/repositories/vendas-movimentacao-repository.port';

/** Um ano na comparação. */
export interface AnoComparado {
  ano: number;
  /** Receita do recorte NESTE ano, já abatida a devolução. */
  receita: number;
  quantidade: number;
  ticketMedio: number;
  /**
   * O recorte ainda está correndo neste ano?
   *
   * Só o ano corrente pode vir `true`. É o que autoriza quem responde a dizer
   * "setembro ainda não fechou" em vez de apresentar um número menor como se
   * fosse o resultado final.
   */
  parcial: boolean;
  /**
   * O recorte FECHADO deste ano, quando a comparação foi cortada no dia.
   *
   * `null` quando não houve corte. Existe para a resposta poder dizer as duas
   * coisas: "até o dia 29 estamos 12% abaixo" e "setembro passado fechou em
   * R$ 2,1 mi" — que é a pergunta seguinte, sempre.
   */
  receitaFechada: number | null;
}

export interface ComparacaoEntreAnos {
  /** Como o recorte é dito para quem lê: "setembro", "01/09 a 15/09". */
  rotulo: string;
  /** O dia em que a comparação foi cortada, quando o recorte ainda corre. */
  cortadoNoDia: number | null;
  anos: AnoComparado[];
}

/**
 * O MESMO RECORTE, ANO A ANO — 29/09/2026.
 *
 * ==========================================================================
 * "COMO ESTA O NOSSO MES COMPARADO AOS OUTROS ANOS?"
 *
 * A Anastasia respondia que nao conseguia, e estava certa: havia o resumo do
 * mes corrente e o ranking por peca ano a ano, mas nada que comparasse o
 * MESMO recorte atraves dos anos. O dado sempre esteve la — `movimentacoes`
 * guarda de 2023 a 2026 — e faltava a pergunta.
 * ==========================================================================
 *
 * ==========================================================================
 * O MES CORRENTE E PARCIAL, E COMPARA-LO INTEIRO MENTE TODO MES.
 *
 * Em 29/09/2026, setembro tem 29 dias corridos; os setembros de 2023, 2024 e
 * 2025 tem 30. Comparar direto faz o ano atual parecer pior SEMPRE, e o erro
 * e maior no comeco do mes: no dia 3, a loja apareceria com 90% de queda.
 *
 * Entao, quando o recorte ainda esta correndo, a comparacao e cortada no
 * MESMO DIA em todos os anos — e o total fechado dos anos anteriores vai
 * junto, porque "e quanto fechou setembro passado?" e a pergunta seguinte.
 * ==========================================================================
 */
@Injectable()
export class CompararAnosUseCase {
  constructor(
    @Inject(VENDAS_MOVIMENTACAO_REPOSITORY)
    private readonly vendas: IVendasMovimentacaoRepository,
  ) {}

  /**
   * @param mes 1 a 12. O recorte é o mês inteiro, em cada ano que tiver dado.
   * @param vendedoraId recorta numa pessoa; `null` é a loja.
   */
  async porMes(
    mes: number,
    vendedoraId: string | null = null,
    agora: Date = new Date(),
  ): Promise<ComparacaoEntreAnos> {
    // O corte só existe quando o mês pedido é o que está correndo AGORA. Pedir
    // "março" em setembro compara março inteiro — ele já fechou.
    const corre = mes === agora.getMonth() + 1;
    const dia = corre ? agora.getDate() : null;

    const linhas = await this.vendas.compararMesNosAnos(mes, dia, vendedoraId);

    return {
      rotulo: MESES[mes - 1],
      cortadoNoDia: dia,
      anos: linhas.map((l) => montar(l, agora.getFullYear(), dia)),
    };
  }

  /**
   * O mesmo intervalo de dias, em cada ano.
   *
   * ========================================================================
   * O QUE SE REPETE E O (MES, DIA), E NAO A DATA.
   *
   * "De 01/09 a 15/09" em 2026 vira "de 01/09 a 15/09" em 2025, 2024 e 2023.
   * Comparar por data absoluta nao teria sentido nenhum — seria o mesmo
   * intervalo uma vez so.
   *
   * INTERVALO QUE VIRA O ANO E RECUSADO. "De 15/12 a 15/01" existiria em dois
   * anos ao mesmo tempo, e qualquer resposta seria uma escolha arbitraria
   * entre duas leituras. Recusar com o motivo e melhor que escolher em
   * silencio.
   * ========================================================================
   */
  async porPeriodo(
    de: Date,
    ate: Date,
    vendedoraId: string | null = null,
    agora: Date = new Date(),
  ): Promise<ComparacaoEntreAnos | { erro: 'PERIODO_VIRA_O_ANO' }> {
    const inicio = { mes: de.getMonth() + 1, dia: de.getDate() };
    const fim = { mes: ate.getMonth() + 1, dia: ate.getDate() };

    if (
      inicio.mes > fim.mes ||
      (inicio.mes === fim.mes && inicio.dia > fim.dia)
    ) {
      return { erro: 'PERIODO_VIRA_O_ANO' };
    }

    const linhas = await this.vendas.compararPeriodoNosAnos(
      inicio,
      fim,
      vendedoraId,
    );

    return {
      rotulo: `${dd(inicio.dia)}/${dd(inicio.mes)} a ${dd(fim.dia)}/${dd(fim.mes)}`,
      cortadoNoDia: null,
      anos: linhas.map((l) => montar(l, agora.getFullYear(), null)),
    };
  }
}

function montar(
  l: { ano: number; receita: number; quantidade: number; receitaFechada: number | null },
  anoCorrente: number,
  dia: number | null,
): AnoComparado {
  return {
    ano: l.ano,
    receita: l.receita,
    quantidade: l.quantidade,
    // TICKET COM DENOMINADOR ZERO E ZERO, e nao NaN: um ano sem venda nenhuma
    // aparece na comparacao, e a linha inteira nao pode virar "NaN".
    ticketMedio: l.quantidade > 0 ? Math.round(l.receita / l.quantidade) : 0,
    parcial: dia !== null && l.ano === anoCorrente,
    receitaFechada: l.receitaFechada,
  };
}

/** Escritos a mao: `toLocaleDateString` em container Alpine nao traduz. */
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const dd = (n: number) => String(n).padStart(2, '0');

/**
 * A variação contra o ano anterior, em pontos percentuais inteiros.
 *
 * `null` quando não há base: dividir por zero daria `Infinity`, e "crescemos
 * infinito por cento" é pior que não dizer nada. Um ano que começou do zero
 * merece a frase "não havia venda nesse mês em 2023", não um número.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}
