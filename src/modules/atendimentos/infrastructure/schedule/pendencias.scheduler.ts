import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispararPendenciasUseCase } from '../../application/use-cases/disparar-pendencias.use-case';

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

  constructor(private readonly disparar: DispararPendenciasUseCase) {}

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
}
