import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappGatewayModule } from '../atendimento/whatsapp-gateway.module';
import { VarrerAlertasUseCase } from './application/varrer-alertas.use-case';
import { ALERTA_REPOSITORY } from './domain/ports/alerta-repository.port';
import { AlertaRepository } from './infrastructure/database/alerta.repository';
import { AlertasScheduler } from './infrastructure/schedule/alertas.scheduler';

/**
 * Os alertas proativos — ANA-19, 20, 21 e 04.
 *
 * MODULO PROPRIO, e nao um pedaco de `leads` ou de `atendimentos`, porque o
 * alerta cruza os dois e vai crescer para vendas (meta em risco, queda de
 * desempenho). Morando em qualquer um deles, o proximo alerta obrigaria uma
 * dependencia entre modulos que hoje nao se conhecem.
 */
@Module({
  imports: [AuthModule, WhatsappGatewayModule],
  providers: [
    { provide: ALERTA_REPOSITORY, useClass: AlertaRepository },
    VarrerAlertasUseCase,
    AlertasScheduler,
  ],
  exports: [ALERTA_REPOSITORY, VarrerAlertasUseCase],
})
export class AlertasModule {}
