import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANASTASIA_TRIAGEM_SYSTEM } from '../../../agentes/application/personas';
import {
  AGENTE_PROMPTS_REPOSITORY,
  LLM_CLIENT,
} from '../../../agentes/domain/ports/injection-tokens';
import type { ILlmClient } from '../../../agentes/domain/ports/llm-client.port';
import type { IAgentePromptsRepository } from '../../../agentes/domain/ports/repositories/agente-prompts-repository.port';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import { WHATSAPP_GATEWAY } from '../../domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../domain/ports/whatsapp-gateway.port';

export interface MensagemRecebida {
  /** Chat de origem (formato WhatsApp, ex.: `5585...@c.us`). */
  de: string;
  /** Texto da mensagem da cliente. */
  texto: string;
}

export interface RespostaAtendimento {
  resposta: string;
  enviada: boolean;
}

/**
 * Loop simples do atendimento por WhatsApp (E9 / decisao 22/06): recebe a
 * mensagem da cliente, gera a resposta da Anastasia (persona de triagem) e
 * envia de volta pelo gateway.
 *
 * Escopo do MVP: SEM lookup/cria cliente, SEM maquina de estados, SEM historico
 * de conversa (cada mensagem e tratada isoladamente). Esses passos entram numa
 * iteracao seguinte, reusando este use case como base.
 */
@Injectable()
export class ProcessarMensagemWhatsappUseCase {
  private readonly logger = new Logger(ProcessarMensagemWhatsappUseCase.name);

  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    private readonly config: ConfigService,
    @Inject(AGENTE_PROMPTS_REPOSITORY)
    private readonly prompts: IAgentePromptsRepository,
  ) {}

  async execute(msg: MensagemRecebida): Promise<RespostaAtendimento | null> {
    // Higiene anti-prompt-injection: remove invisiveis/control chars/XSS antes
    // de o texto da cliente chegar ao LLM (camada de defesa em profundidade).
    const texto = limparEHigienizar(msg.texto).trim();
    if (!texto) return null;

    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ANASTASIA') ?? 'claude-opus-4-8';

    const system =
      (await this.prompts.buscar('anastasia_triagem')) ?? ANASTASIA_TRIAGEM_SYSTEM;
    const { texto: resposta } = await this.llm.chat({
      model,
      system,
      maxTokens: 1024,
      mensagens: [{ role: 'user', content: texto }],
    });

    const limpa = resposta.trim();
    if (!limpa) {
      this.logger.warn('LLM retornou resposta vazia — nada enviado.');
      return { resposta: '', enviada: false };
    }

    // Envio resiliente: falha de envio (ex.: sessao WAHA nao conectada) e
    // logada mas nao derruba o fluxo — preserva a resposta gerada.
    let enviada = false;
    try {
      await this.whatsapp.enviarTexto(msg.de, limpa);
      enviada = true;
    } catch (err) {
      this.logger.error(`Falha ao enviar resposta via WAHA: ${String(err)}`);
    }
    return { resposta: limpa, enviada };
  }
}
