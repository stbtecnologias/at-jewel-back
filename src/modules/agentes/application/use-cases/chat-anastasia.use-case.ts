import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import type { MensagemAgente } from '../../domain/entities/conversa.entity';
import {
  AGENTE_PROMPTS_REPOSITORY,
  LLM_CLIENT,
} from '../../domain/ports/injection-tokens';
import type {
  ChatComGraficoResultado,
  ILlmClient,
} from '../../domain/ports/llm-client.port';
import type { IAgentePromptsRepository } from '../../domain/ports/repositories/agente-prompts-repository.port';
import { ANASTASIA_SYSTEM } from '../personas';

export interface ContextoAgente {
  aba?: string;
  dados?: unknown;
}

@Injectable()
export class ChatAnastasiaUseCase {
  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
    @Inject(AGENTE_PROMPTS_REPOSITORY)
    private readonly prompts: IAgentePromptsRepository,
  ) {}

  async execute(
    mensagens: MensagemAgente[],
    contexto?: ContextoAgente,
  ): Promise<ChatComGraficoResultado> {
    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ANASTASIA') ?? 'claude-opus-4-8';

    const base = (await this.prompts.buscar('anastasia')) ?? ANASTASIA_SYSTEM;
    const system = contexto
      ? `${base}\n\nContexto da aba aberta: ${contexto.aba ?? 'não informada'}.\nDados disponíveis no momento: ${JSON.stringify(contexto.dados ?? {})}`
      : base;

    return this.llm.chatComGrafico({
      model,
      system,
      maxTokens: 2048,
      mensagens: sanitizarMensagens(mensagens),
    });
  }
}

// Higieniza o conteudo das mensagens do usuario antes de enviar ao LLM
// (defesa anti-prompt-injection — remove invisiveis/control chars e XSS).
export function sanitizarMensagens(mensagens: MensagemAgente[]): MensagemAgente[] {
  return mensagens.map((m) =>
    m.role === 'user' ? { ...m, content: limparEHigienizar(m.content) } : m,
  );
}
