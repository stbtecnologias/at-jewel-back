import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappGatewayModule } from '../atendimento/whatsapp-gateway.module';
import { ClientesModule } from '../clientes/clientes.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { LlmModule } from '../agentes/llm.module';
import { ConsultarAgendaVendedoraUseCase } from './application/use-cases/consultar-agenda-vendedora.use-case';
import { DispararPendenciasUseCase } from './application/use-cases/disparar-pendencias.use-case';
import { ProcessarMensagemInternaUseCase } from './application/use-cases/processar-mensagem-interna.use-case';
import { ProcessarRelatoVendedoraUseCase } from './application/use-cases/processar-relato-vendedora.use-case';
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
    // So o LLM, nao o AgentesModule inteiro: aquele importa ESTE modulo (a
    // tool avisar_vendedora abre atendimento), e o Nest recusa o ciclo.
    LlmModule,
  ],
  providers: [
    { provide: ATENDIMENTO_REPOSITORY, useClass: AtendimentoRepository },
    DispararPendenciasUseCase,
    ConsultarAgendaVendedoraUseCase,
    PendenciasScheduler,
    ProcessarRelatoVendedoraUseCase,
    ProcessarMensagemInternaUseCase,
  ],
  // O controller do webhook interno vive no modulo atendimento (singular).
  exports: [ATENDIMENTO_REPOSITORY, ProcessarMensagemInternaUseCase],
})
export class AtendimentosModule {}
