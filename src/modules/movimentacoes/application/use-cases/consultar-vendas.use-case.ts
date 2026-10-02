import { Inject, Injectable } from '@nestjs/common';
import {
  VENDAS_MOVIMENTACAO_REPOSITORY,
  type ItemMaisVendido,
  type FiltroVendasDetalhadas,
  type IVendasMovimentacaoRepository,
  type VendaDetalhada,
  type VendasDeUmaEmpresa,
  type JanelaDeVendas,
  type ResumoDeVendas,
  type VendedoraNoRanking,
} from '../../domain/ports/repositories/vendas-movimentacao-repository.port';

/**
 * O recorte que a gestao pede em palavras.
 *
 * `HOJE` e o padrao — decisao do Lucas em 25/09. Vale saber que ele vem vazio
 * com frequencia: em 2026 a loja teve venda em **12 dias por mes**, em media.
 * Por isso quem responde mostra o mes junto quando o dia esta zerado; ver
 * `ConsultarVendasUseCase.resumo`.
 */
export type RecorteDeVendas = 'HOJE' | 'ONTEM' | 'SEMANA' | 'MES' | 'ANO';

/** Quantos itens o ranking devolve quando ninguem pede outro numero. */
export const LIMITE_PADRAO = 10;
/** Teto duro: lista maior que isto nao se le no WhatsApp. */
export const LIMITE_MAXIMO = 30;

export interface ResumoComRecorte extends ResumoDeVendas {
  /** O periodo efetivamente consultado, para quem responde poder dize-lo. */
  de: Date;
  ate: Date;
  /**
   * Presente SO quando o recorte pedido foi `HOJE` e o dia esta zerado. E o
   * que impede a resposta de virar um beco sem saida.
   */
  mes?: ResumoDeVendas;
}

/**
 * Tudo que se pergunta sobre venda, lido da MOVIMENTACAO.
 *
 * Ver `vendas-movimentacao-repository.port.ts` para a decisao de 25/09 que
 * tirou a tabela `vendas` do caminho.
 */
@Injectable()
export class ConsultarVendasUseCase {
  constructor(
    @Inject(VENDAS_MOVIMENTACAO_REPOSITORY)
    private readonly vendas: IVendasMovimentacaoRepository,
  ) {}

  async resumo(
    recorte: RecorteDeVendas = 'HOJE',
    vendedoraId?: string | null,
    agora: Date = new Date(),
  ): Promise<ResumoComRecorte> {
    const janela = janelaDe(recorte, agora);
    const resumo = await this.vendas.resumo(janela, vendedoraId);

    // O DIA VAZIO NAO PODE SER O FIM DA CONVERSA. Com venda em 12 dias por mes,
    // "hoje nao houve venda" e a resposta mais provavel — e sozinha ela parece
    // defeito. O mes vai junto para a frase ter para onde ir.
    if (recorte === 'HOJE' && resumo.quantidade === 0) {
      const mes = await this.vendas.resumo(janelaDe('MES', agora), vendedoraId);
      return { ...resumo, ...janela, mes };
    }

    return { ...resumo, ...janela };
  }

  async ranking(
    recorte: RecorteDeVendas = 'HOJE',
    limite = LIMITE_PADRAO,
    agora: Date = new Date(),
  ): Promise<{ linhas: VendedoraNoRanking[]; de: Date; ate: Date }> {
    const janela = janelaDe(recorte, agora);
    const linhas = await this.vendas.rankingDeVendedoras(
      janela,
      limitar(limite),
    );
    return { linhas, ...janela };
  }

  async itens(
    recorte: RecorteDeVendas = 'HOJE',
    limite = LIMITE_PADRAO,
    vendedoraId?: string | null,
    agora: Date = new Date(),
  ): Promise<{ linhas: ItemMaisVendido[]; de: Date; ate: Date }> {
    const janela = janelaDe(recorte, agora);
    const linhas = await this.vendas.itensMaisVendidos(
      janela,
      limitar(limite),
      vendedoraId,
    );
    return { linhas, ...janela };
  }

  /**
   * AS VENDAS UMA A UMA — 02/10/2026.
   *
   * O recorte vem pronto de quem conversa: cliente, vendedora, documento e
   * janela ja resolvidos. Aqui so se monta a janela quando ela veio como
   * ATALHO ("setembro", "este mes"); com datas soltas, quem chamou ja passou o
   * intervalo.
   *
   * SEM JANELA E LEGITIMO: "quais as compras da cliente 00376" e sobre a vida
   * inteira dela, nao sobre um mes.
   */
  async detalhadas(
    filtro: Omit<FiltroVendasDetalhadas, 'janela'> & {
      recorte?: RecorteDeVendas;
      de?: Date;
      ate?: Date;
    },
    limite = LIMITE_PADRAO,
    agora: Date = new Date(),
  ): Promise<{ vendas: VendaDetalhada[]; total: number }> {
    const janela =
      filtro.de && filtro.ate
        ? fimDoDia({ de: filtro.de, ate: filtro.ate })
        : filtro.recorte
          ? janelaDe(filtro.recorte, agora)
          : undefined;

    return this.vendas.listarDetalhadas(
      {
        janela,
        clienteId: filtro.clienteId,
        vendedoraId: filtro.vendedoraId,
        documento: filtro.documento,
      },
      limitar(limite),
    );
  }

  /**
   * O faturamento de cada empresa do grupo — 02/10/2026.
   *
   * SEM RECORTE E A VIDA INTEIRA de cada uma, que e como a pergunta costuma
   * vir ("qual o faturamento da MP?").
   */
  async porEmpresa(
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    agora: Date = new Date(),
  ): Promise<VendasDeUmaEmpresa[]> {
    const janela =
      de && ate
        ? fimDoDia({ de, ate })
        : recorte
          ? janelaDe(recorte, agora)
          : undefined;

    return this.vendas.receitaPorEmpresa(janela);
  }

  /** A janela de um periodo dito em datas, para quem pede "de 01/08 a 31/08". */
  async resumoEntre(
    de: Date,
    ate: Date,
    vendedoraId?: string | null,
  ): Promise<ResumoDeVendas> {
    return this.vendas.resumo(fimDoDia({ de, ate }), vendedoraId);
  }

  async itensEntre(
    de: Date,
    ate: Date,
    limite = LIMITE_PADRAO,
    vendedoraId?: string | null,
  ): Promise<ItemMaisVendido[]> {
    return this.vendas.itensMaisVendidos(
      fimDoDia({ de, ate }),
      limitar(limite),
      vendedoraId,
    );
  }

  async rankingEntre(
    de: Date,
    ate: Date,
    limite = LIMITE_PADRAO,
  ): Promise<VendedoraNoRanking[]> {
    return this.vendas.rankingDeVendedoras(fimDoDia({ de, ate }), limitar(limite));
  }

  /**
   * Quem mais vendeu um TIPO de peca — 28/09/2026.
   *
   * As duas formas, como as demais consultas: pelo atalho ou por datas soltas.
   * A pergunta que motivou isto — "quem mais vende brinco em outubro" — precisa
   * das duas: o outubro de um ano especifico so sai por data.
   */
  async porFamilia(
    familia: string,
    recorte: RecorteDeVendas = 'MES',
    limite = LIMITE_PADRAO,
    agora: Date = new Date(),
  ) {
    const janela = janelaDe(recorte, agora);
    const linhas = await this.vendas.rankingPorFamilia(
      janela,
      familia,
      limitar(limite),
    );
    return { linhas, ...janela };
  }

  async porFamiliaEntre(
    familia: string,
    de: Date,
    ate: Date,
    limite = LIMITE_PADRAO,
  ) {
    return this.vendas.rankingPorFamilia(
      fimDoDia({ de, ate }),
      familia,
      limitar(limite),
    );
  }

  /**
   * O mesmo mes, em todos os anos — "quem mais vende brinco em outubro".
   *
   * `porAno` NAO passa pelo `limitar`: aquele teto (30) e para uma lista que
   * alguem le no WhatsApp, e aqui o numero multiplica pelos anos que houver.
   * Tres por ano em quatro anos ja sao doze linhas. O padrao e 1 — a campea
   * de cada outubro, que e a pergunta.
   */
  async porFamiliaNoMes(familia: string, mes: number, porAno = 1) {
    return this.vendas.rankingPorFamiliaNoMes(
      mes,
      familia,
      Math.min(Math.max(Math.trunc(porAno) || 1, 1), 5),
    );
  }
}

/**
 * Teto e piso do limite.
 *
 * O teto nao e paranoia: quem pede "me lista as 500 pecas" no WhatsApp recebe
 * uma mensagem que ninguem le e paga o token de todas elas.
 */
function limitar(limite: number): number {
  if (!Number.isFinite(limite) || limite < 1) return LIMITE_PADRAO;
  return Math.min(Math.trunc(limite), LIMITE_MAXIMO);
}

/**
 * A janela de cada recorte.
 *
 * O FIM E SEMPRE `agora`, e nao o fim do dia: perguntar "quanto vendemos hoje"
 * as 10h e receber o resultado incluindo a tarde seria mentira — e nas janelas
 * maiores o efeito e o mesmo, so que invisivel.
 *
 * MES e ANO sao do CALENDARIO (dia 1, janeiro 1), e nao "ultimos 30 dias":
 * quem pergunta "como esta o mes" quer o mes fechado contra a meta, e nao uma
 * janela movel que nunca bate com nada que a gestao acompanha.
 */
function janelaDe(recorte: RecorteDeVendas, agora: Date): JanelaDeVendas {
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  switch (recorte) {
    case 'HOJE':
      return { de: inicioDoDia, ate: agora };

    case 'ONTEM': {
      const de = new Date(inicioDoDia);
      de.setDate(de.getDate() - 1);
      const ate = new Date(inicioDoDia);
      ate.setMilliseconds(-1);
      return { de, ate };
    }

    case 'SEMANA': {
      const de = new Date(inicioDoDia);
      de.setDate(de.getDate() - 6);
      return { de, ate: agora };
    }

    case 'MES': {
      const de = new Date(inicioDoDia);
      de.setDate(1);
      return { de, ate: agora };
    }

    case 'ANO': {
      const de = new Date(inicioDoDia);
      de.setMonth(0, 1);
      return { de, ate: agora };
    }
  }
}

/** Datas soltas chegam como meia-noite; o fim tem que abraçar o dia inteiro. */
function fimDoDia(janela: JanelaDeVendas): JanelaDeVendas {
  const ate = new Date(janela.ate);
  if (
    ate.getHours() === 0 &&
    ate.getMinutes() === 0 &&
    ate.getSeconds() === 0 &&
    ate.getMilliseconds() === 0
  ) {
    ate.setHours(23, 59, 59, 999);
  }
  return { de: janela.de, ate };
}
