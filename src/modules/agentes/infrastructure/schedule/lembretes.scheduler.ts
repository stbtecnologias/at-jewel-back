import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispararLembretesUseCase } from '../../application/use-cases/disparar-lembretes.use-case';

/**
 * O relogio dos lembretes pessoais — 30/09/2026.
 *
 * DE MINUTO EM MINUTO porque a pessoa escolheu a hora. "Me lembra as 9h" que
 * chega 9h07 e um lembrete ruim, e a varredura e barata: indice parcial sobre
 * `quando` filtrado por PENDENTE.
 *
 * ==========================================================================
 * SEM CHAVE DE DESLIGAR POR AMBIENTE, ao contrario do `AlertasScheduler`.
 *
 * Aquele nasceu atras de `ALERTAS_ATIVOS` porque ele DECIDE SOZINHO que vale
 * incomodar alguem — e uma regra de negocio avaliando dado, e uma regra
 * errada vira mensagem indevida para a equipe inteira.
 *
 * Este nao decide nada. Ele entrega o que uma pessoa pediu, na hora que ela
 * marcou, so para ela. Uma chave para desligar aqui produziria a pior falha
 * possivel desta funcionalidade: o lembrete guardado, a pessoa confiando, e
 * nada tocando.
 * ==========================================================================
 *
 * REENTRANCIA: guarda propria, e nao compartilhada com a varredura de
 * atendimentos — que roda noutro modulo. Uma flag para os dois faria um job
 * travado calar o outro.
 */
@Injectable()
export class LembretesScheduler {
  private readonly logger = new Logger(LembretesScheduler.name);
  private rodando = false;

  constructor(private readonly disparar: DispararLembretesUseCase) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'lembretes-da-gestao' })
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
        `Varredura de lembretes falhou: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.rodando = false;
    }
  }
}
