import { Inject, Injectable } from '@nestjs/common';
import { AGENTE_PROMPTS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAgentePromptsRepository } from '../../domain/ports/repositories/agente-prompts-repository.port';
import { AGENTE_PROMPT_KEYS, AGENTES_PROMPT } from '../personas';

export interface PromptAgenteView {
  agente: string;
  nome: string;
  /** Prompt efetivo (override do DB se houver, senao o padrao do codigo). */
  systemPrompt: string;
  /** Prompt padrao do codigo (para "restaurar"). */
  padrao: string;
  /** true se ha override gravado no DB. */
  customizado: boolean;
  atualizadoEm: Date | null;
}

@Injectable()
export class ListarPromptsUseCase {
  constructor(
    @Inject(AGENTE_PROMPTS_REPOSITORY)
    private readonly repo: IAgentePromptsRepository,
  ) {}

  async execute(): Promise<PromptAgenteView[]> {
    const overrides = await this.repo.buscarTodos();
    const porAgente = new Map(overrides.map((o) => [o.agente, o]));

    return AGENTE_PROMPT_KEYS.map((key) => {
      const meta = AGENTES_PROMPT[key];
      const override = porAgente.get(key);
      return {
        agente: key,
        nome: meta.nome,
        systemPrompt: override?.systemPrompt ?? meta.padrao,
        padrao: meta.padrao,
        customizado: !!override,
        atualizadoEm: override?.atualizadoEm ?? null,
      };
    });
  }
}
