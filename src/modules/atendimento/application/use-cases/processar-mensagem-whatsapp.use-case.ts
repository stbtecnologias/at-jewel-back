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

interface TurnoConversa {
  role: 'user' | 'assistant';
  content: string;
}

interface HistoricoChat {
  turnos: TurnoConversa[];
  atualizadoEm: number;
}

// Memoria de conversa EM PROCESSO (feedback do teste E2E de 02/07: sem
// historico a Anastasia recumprimentava e repetia perguntas ja respondidas).
// Bounded: ultimas MAX_TURNOS mensagens por chat, TTL de inatividade e teto de
// chats simultaneos. Persistencia de verdade (banco/estado de triagem) entra na
// frente de triagem-com-dados do ATwpp — aqui e o suficiente para a conversa
// fluir com contexto. Perde-se em restart da API (aceitavel no homolog).
const MAX_TURNOS = 20; // 10 pares user/assistant
const TTL_MS = 6 * 60 * 60_000; // 6h sem mensagem = conversa nova
const MAX_CHATS = 500;

/**
 * Loop simples do atendimento por WhatsApp (E9 / decisao 22/06): recebe a
 * mensagem da cliente, gera a resposta da Anastasia (persona de triagem) com o
 * historico recente do chat e envia de volta pelo gateway.
 *
 * Escopo do MVP: SEM lookup/cria cliente e SEM maquina de estados; o historico
 * de conversa e mantido apenas em memoria. Esses passos entram numa iteracao
 * seguinte, reusando este use case como base.
 */
@Injectable()
export class ProcessarMensagemWhatsappUseCase {
  private readonly logger = new Logger(ProcessarMensagemWhatsappUseCase.name);
  private readonly historicos = new Map<string, HistoricoChat>();

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
    const historico = this.historicoDe(msg.de);
    const { texto: resposta } = await this.llm.chat({
      model,
      system,
      maxTokens: 1024,
      mensagens: [...historico.turnos, { role: 'user', content: texto }],
    });

    // A mensagem da cliente entra no historico mesmo se a resposta falhar —
    // o contexto do que ela disse continua valendo no proximo turno.
    this.registrarTurno(historico, { role: 'user', content: texto });

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
      // So registra a resposta que a cliente de fato RECEBEU; se o envio
      // falhou, referenciar esse conteudo depois soaria como algo nunca dito.
      this.registrarTurno(historico, { role: 'assistant', content: limpa });
    } catch (err) {
      this.logger.error(`Falha ao enviar resposta via WAHA: ${String(err)}`);
    }
    return { resposta: limpa, enviada };
  }

  /** Historico do chat: cria/renova; TTL de inatividade zera a conversa. */
  private historicoDe(chatId: string): HistoricoChat {
    const agora = Date.now();
    let hist = this.historicos.get(chatId);
    if (hist && agora - hist.atualizadoEm > TTL_MS) {
      hist.turnos = [];
    }
    if (!hist) {
      this.evictSeCheio();
      hist = { turnos: [], atualizadoEm: agora };
      this.historicos.set(chatId, hist);
    }
    return hist;
  }

  private registrarTurno(hist: HistoricoChat, turno: TurnoConversa): void {
    hist.turnos.push(turno);
    if (hist.turnos.length > MAX_TURNOS) {
      hist.turnos.splice(0, hist.turnos.length - MAX_TURNOS);
    }
    hist.atualizadoEm = Date.now();
  }

  /** Teto de chats em memoria: descarta o menos recente (varredura simples). */
  private evictSeCheio(): void {
    if (this.historicos.size < MAX_CHATS) return;
    let maisAntigo: string | null = null;
    let menorTs = Infinity;
    for (const [id, h] of this.historicos) {
      if (h.atualizadoEm < menorTs) {
        menorTs = h.atualizadoEm;
        maisAntigo = id;
      }
    }
    if (maisAntigo) this.historicos.delete(maisAntigo);
  }
}
