import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AGENTE_PROMPTS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAgentePromptsRepository } from '../../domain/ports/repositories/agente-prompts-repository.port';
import { AGENTE_PROMPT_KEYS } from '../personas';

@Injectable()
export class AtualizarPromptUseCase {
  constructor(
    @Inject(AGENTE_PROMPTS_REPOSITORY)
    private readonly repo: IAgentePromptsRepository,
  ) {}

  async execute(
    agente: string,
    systemPrompt: string,
    atualizadoPor: string | null,
  ): Promise<void> {
    if (!(AGENTE_PROMPT_KEYS as string[]).includes(agente)) {
      throw new BadRequestException(`Agente desconhecido: ${agente}`);
    }
    const texto = systemPrompt.trim();
    if (texto.length < 20) {
      throw new BadRequestException('O prompt precisa ter ao menos 20 caracteres.');
    }
    await this.repo.salvar(agente, texto, atualizadoPor);
  }
}
