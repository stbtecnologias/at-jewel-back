import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAnalyticsRepository } from '../../domain/ports/repositories/analytics-repository.port';

/**
 * AS OPCOES DO FILTRO DE EMPRESA — 02/10/2026.
 *
 * ==========================================================================
 * SO AS EMPRESAS QUE TEM MOVIMENTO.
 *
 * O grupo tem oito CNPJs cadastrados e dois com venda. Oferecer os oito faria
 * o filtro parecer um cadastro — e seis deles nao mudariam numero nenhum,
 * entao seriam seis opcoes que so devolvem tela vazia.
 *
 * Quando a filial de SP comecar a exportar, ela aparece aqui sozinha: a lista
 * sai do dado, e nao de uma constante que alguem precisaria lembrar de mexer.
 * ==========================================================================
 */
@Injectable()
export class EmpresasDoFiltroUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(): Promise<{ id: string; nome: string }[]> {
    return this.repo.empresasComMovimento();
  }
}
