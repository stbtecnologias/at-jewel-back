import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DIAS_ATE_PARADO } from '../../domain/entities/estado-lead';
import { LEAD_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILeadRepository } from '../../domain/ports/repositories/lead-repository.port';

/**
 * O relogio do lead que esfriou — ANA-03, 29/09/2026.
 *
 * ==========================================================================
 * SETE DIAS, E A DECISAO E DO LUCAS (29/09/2026).
 *
 * `PARADO` nao e desfecho: e a ausencia dele. A cliente que sumiu ha oito
 * dias pode voltar amanha, e quando voltar o lead volta a andar — por isso
 * `PARADO` continua contando como lead em aberto, e nao como perdido.
 *
 * Chamar de perdido o que apenas esfriou seria mentir duas vezes: some do
 * funil quem ainda pode comprar, e a taxa de conversao (ANA-13) piora sozinha
 * a cada semana sem que ninguem tenha desistido de nada.
 * ==========================================================================
 *
 * DE HORA EM HORA, E NAO DE DEZ EM DEZ MINUTOS. O evento que se persegue
 * demora SETE DIAS para acontecer; varrer com mais frequencia so gastaria
 * consulta para descobrir o mesmo nada. Uma hora de atraso num prazo de uma
 * semana e erro de 0,6%.
 *
 * REENTRANCIA: o `@Cron` do Nest nao espera a rodada anterior. Aqui o risco e
 * pequeno — o UPDATE e idempotente, e a segunda rodada nao acharia mais
 * ninguem —, mas a trava evita duas varreduras concorrentes na mesma tabela
 * quando o banco esta lento.
 */
@Injectable()
export class LeadsParadosScheduler {
  private readonly logger = new Logger(LeadsParadosScheduler.name);
  private rodando = false;

  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leads: ILeadRepository,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'leads-parados' })
  async varrer(): Promise<void> {
    if (this.rodando) {
      this.logger.warn('Varredura anterior ainda em andamento — pulando esta.');
      return;
    }
    this.rodando = true;
    try {
      const limite = new Date();
      limite.setDate(limite.getDate() - DIAS_ATE_PARADO);

      const quantos = await this.leads.marcarParados(limite);
      // So fala quando houve trabalho: uma linha por hora dizendo "nenhum"
      // afogaria o log em que os outros avisos precisam ser vistos.
      if (quantos > 0) {
        this.logger.log(
          `${quantos} lead(s) sem novidade ha ${DIAS_ATE_PARADO} dias marcados como PARADO.`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Varredura de leads parados falhou: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.rodando = false;
    }
  }
}
