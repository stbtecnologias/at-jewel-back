import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import { ANASTASIA_GESTAO_SYSTEM } from '../../../agentes/application/personas';
import { LLM_CLIENT } from '../../../agentes/domain/ports/injection-tokens';
import type { ILlmClient } from '../../../agentes/domain/ports/llm-client.port';
import { FerramentasGestaoService } from '../ferramentas-gestao.service';
import { MemoriaConversaService } from '../memoria-conversa.service';

export interface MensagemGestao {
  /** Id do usuario. E a CHAVE da memoria de conversa — nunca o telefone. */
  usuarioId: string;
  /** Nome de quem esta falando, para a agente tratar pelo primeiro nome. */
  nome: string | null;
  texto: string;
}

export interface RespostaGestao {
  resposta: string;
  motivo: 'conversa' | 'falha_agente';
}

/**
 * O canal interno da GESTAO, no WhatsApp.
 *
 * ==========================================================================
 * A IMAGEM EM ESPELHO DO CANAL DA VENDEDORA, E A COMPARACAO E O PONTO.
 *
 * La (`ProcessarMensagemInternaUseCase`) o `vendedoraId` entra por CLOSURE,
 * vindo do telefone, e nenhuma ferramenta aceita "de quem" — o escopo e
 * ausencia de caminho, nao regra de prompt.
 *
 * Aqui e o contrario por desenho: quem fala e da administracao, entao "de
 * quem" e justamente o que ela informa. As ferramentas sao OUTRAS
 * (`gestaoAgenda` e nao `consultarAgenda`), e e por isso que a assimetria se
 * sustenta: se eu tivesse acrescentado um `vendedora?` opcional as ferramentas
 * da vendedora, bastaria o modelo preencher esse campo no canal dela para o
 * escopo cair inteiro.
 * ==========================================================================
 *
 * AS FERRAMENTAS VEM DO `FerramentasGestaoService` — o MESMO que o painel usa.
 * Aqui fica so o que e proprio do WhatsApp: quem esta falando, a memoria da
 * conversa e a ausencia de grafico.
 *
 * QUEM CHEGA AQUI JA FOI RECONHECIDO como usuario com permissao de gestao. A
 * verificacao mora no `BuscarAdminPorTelefoneUseCase`, antes desta chamada.
 */
@Injectable()
export class ProcessarMensagemGestaoUseCase {
  private readonly logger = new Logger(ProcessarMensagemGestaoUseCase.name);

  constructor(
    private readonly ferramentas: FerramentasGestaoService,
    private readonly memoria: MemoriaConversaService,
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
  ) {}

  async execute(msg: MensagemGestao): Promise<RespostaGestao> {
    const primeiroNome = msg.nome?.trim().split(/\s+/)[0] ?? null;
    const system =
      `${ANASTASIA_GESTAO_SYSTEM}\n\n` +
      (primeiroNome ? `Você está falando com ${primeiroNome}. ` : '') +
      `Agora são ${agoraLocal()} (fuso da loja) — use isto para entender "hoje", ` +
      `"amanhã" e horários relativos.`;

    // A conversa anterior, se houver. Sem isso, "e a Beatriz?" ou "pode
    // transferir" chegariam como frases soltas. Ver MemoriaConversaService.
    const chave = MemoriaConversaService.chaveGestao(msg.usuarioId);
    const historico = this.memoria.carregar(chave);
    const pergunta = limparEHigienizar(msg.texto);

    try {
      const { texto } = await this.llm.chatComFerramentas({
        model: this.config.get<string>('ANTHROPIC_MODEL_GESTAO') ?? 'claude-opus-4-8',
        system,
        maxTokens: 700,
        mensagens: [...historico, { role: 'user', content: pergunta }],
        // Mesmo motivo do canal da vendedora: WhatsApp nao renderiza grafico.
        graficos: false,
        ...this.ferramentas.montar(),
      });

      // So guarda o que deu certo. Turno com falha na memoria faria a proxima
      // resposta se apoiar num erro.
      this.memoria.registrar(chave, pergunta, texto);
      return { resposta: texto, motivo: 'conversa' };
    } catch (err) {
      this.logger.error(
        `Falha do agente de gestao: ${err instanceof Error ? err.message : err}`,
      );
      return {
        resposta: 'Não consegui consultar isso agora. Pode tentar de novo em instantes?',
        motivo: 'falha_agente',
      };
    }
  }
}

function agoraLocal(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}
