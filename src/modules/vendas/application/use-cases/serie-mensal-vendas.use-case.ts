import { Inject, Injectable } from '@nestjs/common';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IVendaRepository,
  RecorteVenda,
  SerieMensalVendas,
} from '../../domain/ports/repositories/venda-repository.port';

/** Sem periodo, o grafico mostra os ultimos 12 meses — como mostrava antes. */
export const MESES_SEM_PERIODO = 12;

/** Teto da serie: 36 meses, o mesmo do `/analytics/receita-mensal`. */
export const MESES_NO_MAXIMO = 36;

/**
 * A serie mensal da tela de vendas — o grafico "Receita mensal × Meta" e as
 * sparklines dos cards.
 *
 * ==========================================================================
 * EXISTE DESDE 11/09/2026, e por um motivo so: SEGUIR O FILTRO DA TELA.
 *
 * A tela de vendas desenhava o grafico com o `/analytics/receita-mensal`, que
 * nao conhece status, forma de pagamento nem vendedora — e nem o periodo. O
 * Yerlon filtrava PIX e o grafico continuava o mesmo: "nenhum grafico respeita
 * os filtros". Esta rota recebe o MESMO filtro do resumo, e por isso tambem o
 * mesmo isolamento da vendedora (o controller forca a dela).
 * ==========================================================================
 *
 * A JANELA: com periodo, do mes do inicio ao mes do fim; sem periodo, os
 * ultimos 12 meses. Mais de 36 meses fica nos ultimos 36 — a agregacao e
 * barata, mas um grafico de dez anos em barras mensais nao se le.
 */
@Injectable()
export class SerieMensalVendasUseCase {
  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  async execute(
    filtros: RecorteVenda,
    agora: Date = new Date(),
  ): Promise<SerieMensalVendas> {
    const ate = filtros.dataAte ?? agora;
    let de = filtros.dataDe ?? mesesAntes(ate, MESES_SEM_PERIODO - 1);

    // Periodo invertido nao e erro de quem pediu a serie: vira o mes do fim.
    if (de > ate) de = ate;

    const limite = mesesAntes(ate, MESES_NO_MAXIMO - 1);
    if (de < limite) de = limite;

    return this.vendaRepo.serieMensal(filtros, { de, ate });
  }
}

/** O primeiro dia do mes que fica `n` meses antes de `data`. */
function mesesAntes(data: Date, n: number): Date {
  return new Date(data.getFullYear(), data.getMonth() - n, 1);
}
