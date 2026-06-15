import { Inject, Injectable } from '@nestjs/common';
import { datasComemorativas } from '../../domain/commemorative-dates';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ComportamentoData,
  IAnalyticsRepository,
  JanelaData,
} from '../../domain/ports/repositories/analytics-repository.port';

// Dias antes da data comemorativa considerados "periodo de compra".
const JANELA_DIAS = 15;

@Injectable()
export class ComportamentoDatasUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(ano: number): Promise<ComportamentoData[]> {
    const janelas: JanelaData[] = datasComemorativas(ano).map((d) => {
      const de = new Date(d.data);
      de.setDate(de.getDate() - JANELA_DIAS);
      return { nome: d.nome, de, ate: d.data };
    });
    return this.repo.comportamentoDatas(janelas);
  }
}
