import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispararPendenciasUseCase } from '../../application/use-cases/disparar-pendencias.use-case';
import { EncerrarPorSilencioUseCase } from '../../application/use-cases/encerrar-por-silencio.use-case';

/**
 * Relogio da agenda. Primeiro agendador do projeto — ate 19/08/2026 nada aqui
 * rodava por tempo.
 *
 * DE MINUTO EM MINUTO porque o combinado com o cliente tem hora marcada: um
 * intervalo maior atrasaria o lembrete justamente na hora em que ele importa.
 * A varredura e barata — indice parcial sobre PENDENTE + agendado_para.
 *
 * REENTRANCIA: o `@Cron` do Nest nao espera a execucao anterior terminar. Uma
 * rodada lenta (WAHA travado) poderia sobrepor a seguinte e disparar a mesma
 * pendencia duas vezes, entao a guarda `rodando` serializa as rodadas.
 */
@Injectable()
export class PendenciasScheduler {
  private readonly logger = new Logger(PendenciasScheduler.name);
  private rodando = false;
  private varrendoSilencio = false;

  constructor(
    private readonly disparar: DispararPendenciasUseCase,
    private readonly silencio: EncerrarPorSilencioUseCase,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'agenda-atendimentos' })
  async varrer(): Promise<void> {
    if (this.rodando) {
      this.logger.warn('Rodada anterior ainda em andamento — pulando esta.');
      return;
    }
    this.rodando = true;
    try {
      await this.disparar.execute();
    } catch (err) {
      this.logger.error(
        `Varredura da agenda falhou: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.rodando = false;
    }
  }
  /**
   * O SILENCIO, DE HORA EM HORA — e nao de minuto em minuto como a agenda.
   *
   * A regra e de 48 HORAS. Checar sessenta vezes por hora uma condicao que
   * muda em dois dias seria varredura a toa; de hora em hora o atraso maximo
   * e de uma hora sobre um prazo de quarenta e oito.
   *
   * Guarda de reentrancia propria: uma rodada lenta nao pode sobrepor a
   * seguinte e fechar o mesmo atendimento duas vezes.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'silencio-atendimentos' })
  async varrerSilencio(): Promise<void> {
    if (this.varrendoSilencio) {
      this.logger.warn('Varredura de silêncio anterior ainda rodando — pulando.');
      return;
    }
    this.varrendoSilencio = true;
    try {
      await this.silencio.execute();
    } catch (err) {
      this.logger.error(
        `Varredura de silêncio falhou: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.varrendoSilencio = false;
    }
  }

}
