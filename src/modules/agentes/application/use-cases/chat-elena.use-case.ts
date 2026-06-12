import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MensagemAgente } from '../../domain/entities/conversa.entity';
import { LLM_CLIENT } from '../../domain/ports/injection-tokens';
import type { ChatResultado, ILlmClient } from '../../domain/ports/llm-client.port';
import { ELENA_SYSTEM } from '../personas';
import type { ContextoAgente } from './chat-anastasia.use-case';
import { sanitizarMensagens } from './chat-anastasia.use-case';

@Injectable()
export class ChatElenaUseCase {
  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
  ) {}

  async execute(
    mensagens: MensagemAgente[],
    contexto?: ContextoAgente,
  ): Promise<ChatResultado> {
    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ELENA') ?? 'claude-sonnet-4-6';

    const system = contexto
      ? `${ELENA_SYSTEM}\n\nContexto atual:\n${JSON.stringify(contexto.dados ?? {})}`
      : ELENA_SYSTEM;

    return this.llm.chat({
      model,
      system,
      maxTokens: 2048,
      mensagens: sanitizarMensagens(mensagens),
    });
  }
}
