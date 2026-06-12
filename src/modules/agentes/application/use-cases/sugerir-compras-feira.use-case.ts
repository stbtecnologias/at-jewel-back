import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AGENTES_DATA_REPOSITORY,
  LLM_CLIENT,
} from '../../domain/ports/injection-tokens';
import type { ILlmClient } from '../../domain/ports/llm-client.port';
import type { IAgentesDataRepository } from '../../domain/ports/repositories/agentes-data-repository.port';
import { ANASTASIA_SYSTEM } from '../personas';

@Injectable()
export class SugerirComprasFeiraUseCase {
  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    @Inject(AGENTES_DATA_REPOSITORY)
    private readonly dados: IAgentesDataRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(): Promise<{ texto: string; tokens: number }> {
    const [alertasEstoque, giroLento] = await Promise.all([
      this.dados.alertasEstoque(20),
      this.dados.giroLento(90, 20),
    ]);

    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ANASTASIA') ?? 'claude-opus-4-8';

    const prompt = `Com base nos dados de estoque abaixo, sugira o que comprar na próxima feira de fornecedores:

Estoque crítico (≤ 2 unidades): ${JSON.stringify(alertasEstoque)}
Giro lento (> 90 dias em estoque): ${JSON.stringify(giroLento)}

Forneça sugestões específicas por categoria com justificativa estratégica.`;

    return this.llm.chat({
      model,
      system: ANASTASIA_SYSTEM,
      maxTokens: 2000,
      mensagens: [{ role: 'user', content: prompt }],
    });
  }
}
