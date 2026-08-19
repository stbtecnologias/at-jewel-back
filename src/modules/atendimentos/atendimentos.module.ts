import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappGatewayModule } from '../atendimento/whatsapp-gateway.module';
import { ClientesModule } from '../clientes/clientes.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { DispararPendenciasUseCase } from './application/use-cases/disparar-pendencias.use-case';
import { PendenciasScheduler } from './infrastructure/schedule/pendencias.scheduler';
import { ATENDIMENTO_REPOSITORY } from './domain/ports/injection-tokens';
import { AtendimentoInteracaoOrmEntity } from './infrastructure/database/typeorm/entities/atendimento-interacao.orm-entity';
import { AtendimentoOrmEntity } from './infrastructure/database/typeorm/entities/atendimento.orm-entity';
import { AtendimentoRepository } from './infrastructure/database/typeorm/repositories/atendimento.repository';

/**
 * Episodios de atendimento (migracao 35) e a linha do tempo de cada um.
 *
 * Sem controller por enquanto: quem escreve aqui e a tool `avisar_vendedora`
 * da Anastasia, e quem le sera o agendador. A tela vem depois.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AtendimentoOrmEntity, AtendimentoInteracaoOrmEntity]),
    // O agendador precisa do nome do cliente, do WhatsApp da vendedora e do
    // gateway de envio. Nenhum destes importa atendimentos — sem ciclo.
    ClientesModule,
    VendedorasModule,
    WhatsappGatewayModule,
  ],
  providers: [
    { provide: ATENDIMENTO_REPOSITORY, useClass: AtendimentoRepository },
    DispararPendenciasUseCase,
    PendenciasScheduler,
  ],
  exports: [ATENDIMENTO_REPOSITORY],
})
export class AtendimentosModule {}
