import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAnalyticsRepository } from '../../domain/ports/repositories/analytics-repository.port';

/**
 * AS OPCOES DO FILTRO DE EMPRESA — 02/10/2026.
 *
 * ==========================================================================
 * TODAS AS ATIVAS, inclusive as que nunca venderam — decisao do Lucas.
 *
 * Seis das oito devolvem tela vazia hoje, e isso e informacao: "a AT HOME
 * vendeu alguma coisa?" so tem resposta se der para seleciona-la. Empresa
 * fora da lista parece empresa que nao existe.
 *
 * A filial de SP ja aparece — e, enquanto nao exportar, responde vazio, que
 * e exatamente o que esta acontecendo com ela.
 * ==========================================================================
 */
@Injectable()
export class EmpresasDoFiltroUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(): Promise<{ id: string; nome: string }[]> {
    return this.repo.empresasDoGrupo();
  }
}
