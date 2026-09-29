import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PERMISSAO_GESTAO } from '../../../auth/application/use-cases/buscar-admin-por-telefone.use-case';
import { PermissionsService } from '../../../auth/application/permissions.service';
import { ADMIN_USER_REPOSITORY } from '../../../auth/domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../../auth/domain/ports/repositories/admin-user-repository.port';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { VarrerAlertasUseCase } from '../../application/varrer-alertas.use-case';

/**
 * O relogio dos alertas — ANA-19, 29/09/2026.
 *
 * ==========================================================================
 * ESTE E O UNICO AGENDADOR DO DOCUMENTO QUE FALA COM GENTE SOZINHO.
 *
 * Os outros calculam e esperam alguem perguntar. Este manda mensagem no
 * WhatsApp de uma pessoa sem ela ter pedido — e por isso nasce DESLIGADO.
 *
 * `ALERTAS_ATIVOS=true` e o interruptor. Nao e zelo excessivo: uma regra com
 * prazo errado, num banco com leads antigos, dispara dezenas de mensagens na
 * primeira rodada. Ligar de proposito, depois de olhar o que a varredura
 * ENCONTRARIA, e a diferenca entre estrear bem e queimar o recurso.
 *
 * Com ele desligado a varredura AINDA RODA e ainda loga o que faria — e e
 * assim que se confere o prazo antes de deixar sair.
 * ==========================================================================
 *
 * DE HORA EM HORA. Os dois alertas implementados tem prazo de 2h e 7 dias;
 * varrer com mais frequencia so gastaria consulta para achar o mesmo nada.
 */
@Injectable()
export class AlertasScheduler {
  private readonly logger = new Logger(AlertasScheduler.name);
  private rodando = false;

  constructor(
    private readonly varrer: VarrerAlertasUseCase,
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly admins: IAdminUserRepository,
    private readonly permissoes: PermissionsService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'alertas-proativos' })
  async rodar(): Promise<void> {
    if (this.rodando) {
      this.logger.warn('Varredura anterior ainda em andamento — pulando esta.');
      return;
    }
    this.rodando = true;

    try {
      const ligado = this.config.get<string>('ALERTAS_ATIVOS') === 'true';
      const destinos = await this.destinatarios();

      // ENSAIO: com o interruptor desligado, tudo acontece menos o envio. O
      // log diz quantos SAIRIAM, que e o numero que se confere antes de ligar.
      const enviar = ligado
        ? async (destino: string, texto: string) => {
            await this.whatsapp.enviarTexto(destino, texto);
          }
        : async () => {
            /* ensaio: nao envia */
          };

      const r = await this.varrer.execute(enviar, destinos);

      if (r.enviados > 0 || r.falhas > 0) {
        this.logger.log(
          `Alertas: ${r.enviados} ${ligado ? 'enviado(s)' : 'SERIAM enviados (ensaio)'}, ` +
            `${r.repetidos} já avisado(s), ${r.falhas} falha(s).`,
        );
      }
      if (r.ignoradas.length > 0) {
        this.logger.debug(`Alertas ignorados: ${r.ignoradas.join('; ')}.`);
      }
    } catch (err) {
      this.logger.error(
        `Varredura de alertas falhou: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.rodando = false;
    }
  }

  /**
   * Quem recebe — o MESMO criterio do aviso de lead que ja existia.
   *
   * Todo usuario com telefone cadastrado E permissao de gestao. Inventar um
   * criterio proprio aqui criaria dois entendimentos de "quem e a gestao", e
   * eles divergiriam no dia em que alguem mudasse de papel.
   */
  private async destinatarios(): Promise<string[]> {
    const todos = await this.admins.listarTodos();
    const destinos: string[] = [];

    for (const admin of todos) {
      if (!admin.telefone) continue;
      if (await this.permissoes.possui(admin.role, PERMISSAO_GESTAO)) {
        destinos.push(admin.telefone);
      }
    }
    return destinos;
  }
}
