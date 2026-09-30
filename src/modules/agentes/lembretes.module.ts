import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { WhatsappGatewayModule } from '../atendimento/whatsapp-gateway.module';
import { LembretesService } from './application/lembretes.service';
import { DispararLembretesUseCase } from './application/use-cases/disparar-lembretes.use-case';
import { LEMBRETES_REPOSITORY } from './domain/ports/injection-tokens';
import { LembreteOrmEntity } from './infrastructure/database/typeorm/entities/lembrete.orm-entity';
import { LembretesRepository } from './infrastructure/database/typeorm/repositories/lembretes.repository';
import { LembretesScheduler } from './infrastructure/schedule/lembretes.scheduler';

/**
 * Os lembretes pessoais da gestao, isolados num modulo proprio — 30/09/2026.
 *
 * ==========================================================================
 * POR QUE SEPARADO — a mesma resposta do `CombinadosModule`.
 *
 * O `AgentesModule` importa o `AtendimentosModule` (a tool `avisar_vendedora`
 * abre atendimento). Se o canal de WhatsApp da gestao importasse o
 * AgentesModule para pegar o `LembretesService`, fecharia ciclo, e o Nest
 * recusa.
 *
 * Este importa so folhas: TypeORM, o `AuthModule` (para achar o dono e o
 * telefone dele) e o `WhatsappGatewayModule` (que nao importa nada). Entao os
 * dois lados podem importa-lo sem ciclo.
 * ==========================================================================
 *
 * O SCHEDULER MORA AQUI, e nao no `PendenciasScheduler` do modulo de
 * atendimentos — aquele e de outro modulo, e cruzar os dois so para reusar um
 * `@Cron` custaria mais do que um arquivo novo. Cada um com a sua guarda de
 * reentrancia.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LembreteOrmEntity]),
    AuthModule,
    WhatsappGatewayModule,
  ],
  providers: [
    LembretesService,
    { provide: LEMBRETES_REPOSITORY, useClass: LembretesRepository },
    DispararLembretesUseCase,
    LembretesScheduler,
  ],
  exports: [LembretesService],
})
export class LembretesModule {}
