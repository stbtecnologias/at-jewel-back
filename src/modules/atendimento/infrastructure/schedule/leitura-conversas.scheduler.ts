import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LerConversaWhatsappUseCase } from '../../application/ler-conversa-whatsapp.use-case';

/**
 * O relogio do leitor de conversas — MEL-15.
 *
 * DE DEZ EM DEZ MINUTOS, e nao de hora em hora como o silencio.
 *
 * A hora de ler e escolhida quando a mensagem chega (`ler_em` = ultima
 * mensagem + 1h). Este agendador so pergunta "chegou a hora de alguem?", e a
 * consulta e um indice parcial que na maior parte das rodadas devolve zero
 * linhas. Rodar de hora em hora somaria ate 60 minutos de atraso a uma espera
 * que ja e de 60 — dez minutos mantem o custo perto de zero e o atraso baixo.
 *
 * NAO EXISTE RODADA CARA POR ACIDENTE: o lote e limitado no caso de uso, entao
 * uma fila represada e drenada aos poucos em vez de virar uma rajada de
 * chamadas ao modelo.
 *
 * REENTRANCIA: o `@Cron` do Nest nao espera a rodada anterior terminar. Uma
 * rodada lenta (modelo demorado, WAHA travado) sobreporia a seguinte e a mesma
 * conversa seria lida duas vezes — dois relatos iguais no atendimento.
 */
@Injectable()
export class LeituraConversasScheduler {
  private readonly logger = new Logger(LeituraConversasScheduler.name);
  private rodando = false;

  constructor(private readonly leitor: LerConversaWhatsappUseCase) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'leitura-conversas-whatsapp' })
  async varrer(): Promise<void> {
    if (this.rodando) {
      this.logger.warn('Leitura anterior ainda em andamento — pulando esta.');
      return;
    }
    this.rodando = true;
    try {
      await this.leitor.execute();
    } catch (err) {
      this.logger.error(
        `Varredura de leitura falhou: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.rodando = false;
    }
  }
}
