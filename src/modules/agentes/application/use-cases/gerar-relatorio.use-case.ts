import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AGENTES_DATA_REPOSITORY,
  LLM_CLIENT,
} from '../../domain/ports/injection-tokens';
import type { ILlmClient } from '../../domain/ports/llm-client.port';
import type { IAgentesDataRepository } from '../../domain/ports/repositories/agentes-data-repository.port';
import { ANASTASIA_SYSTEM } from '../personas';

export type TipoRelatorio = 'vendas' | 'clientes';

@Injectable()
export class GerarRelatorioUseCase {
  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    @Inject(AGENTES_DATA_REPOSITORY)
    private readonly dados: IAgentesDataRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(
    tipo: TipoRelatorio,
    filtros?: { dataInicio?: Date; dataFim?: Date },
  ): Promise<{ texto: string; tokens: number }> {
    let contexto = '';
    if (tipo === 'vendas') {
      const kpis = await this.dados.kpisVendas(filtros?.dataInicio, filtros?.dataFim);
      contexto = JSON.stringify(kpis);
    } else {
      const demografia = await this.dados.demografia();
      contexto = JSON.stringify(demografia);
    }

    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ANASTASIA') ?? 'claude-opus-4-8';

    return this.llm.chat({
      model,
      system: ANASTASIA_SYSTEM,
      maxTokens: 3000,
      mensagens: [
        {
          role: 'user',
          content: `Gere um relatório executivo de ${tipo} com base nos seguintes dados agregados (sem PII):\n\n${contexto}\n\nFiltros aplicados: ${JSON.stringify(filtros ?? {})}`,
        },
      ],
    });
  }
}
