import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroAnalitico,
  IAnalyticsRepository,
  ReceitaMensal,
} from '../../domain/ports/repositories/analytics-repository.port';

/** Teto da serie, para conter o custo da agregacao. */
const MESES_NO_MAXIMO = 36;

/**
 * A serie mensal de receita da tela de Analytics.
 *
 * A JANELA: com periodo no filtro, do mes do inicio ao mes do fim; sem
 * periodo, os ultimos `meses` (1 a 36, padrao 6) — que era o unico
 * comportamento ate 11/09/2026, quando o grafico passou a seguir o filtro.
 * Mais de 36 meses fica nos ultimos 36.
 */
@Injectable()
export class ReceitaMensalUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(
    meses = 6,
    filtro?: FiltroAnalitico,
    agora: Date = new Date(),
  ): Promise<ReceitaMensal> {
    const n = Math.min(MESES_NO_MAXIMO, Math.max(1, Math.trunc(meses) || 6));

    const ate = filtro?.dataFim ?? agora;
    let de = filtro?.dataInicio ?? mesesAntes(ate, n - 1);
    if (de > ate) de = ate;
    const limite = mesesAntes(ate, MESES_NO_MAXIMO - 1);
    if (de < limite) de = limite;

    return this.repo.receitaMensal({ de, ate }, filtro);
  }
}

/** O primeiro dia do mes que fica `n` meses antes de `data`. */
function mesesAntes(data: Date, n: number): Date {
  return new Date(data.getFullYear(), data.getMonth() - n, 1);
}
