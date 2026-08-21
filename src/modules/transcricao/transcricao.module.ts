import { Module } from '@nestjs/common';
import { TRANSCRICAO_SERVICE } from './domain/ports/injection-tokens';
import { OpenaiTranscricaoClient } from './infrastructure/openai/openai-transcricao.client';

/**
 * Audio vira texto. So isso.
 *
 * Modulo folha de proposito — nao importa nada, e por isso as DUAS portas de
 * entrada podem importa-lo sem risco de ciclo: o canal interno de WhatsApp
 * (AtendimentosModule) e o chat do painel (AgentesModule).
 *
 * O audio morre aqui. Nada depois deste ponto sabe que houve audio: o texto
 * segue exatamente pelo mesmo caminho de uma mensagem digitada.
 */
@Module({
  providers: [{ provide: TRANSCRICAO_SERVICE, useClass: OpenaiTranscricaoClient }],
  exports: [TRANSCRICAO_SERVICE],
})
export class TranscricaoModule {}
