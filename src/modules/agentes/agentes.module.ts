import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AgenteEventosModule } from '../agente-eventos/agente-eventos.module';
import { LlmModule } from './llm.module';
import { WhatsappGatewayModule } from '../atendimento/whatsapp-gateway.module';
import { AtendimentosModule } from '../atendimentos/atendimentos.module';
import { ClientesModule } from '../clientes/clientes.module';
import { DemandasModule } from '../demandas/demandas.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { AvisarVendedoraUseCase } from './application/use-cases/avisar-vendedora.use-case';
import { AnalisarProdutoUseCase } from './application/use-cases/analisar-produto.use-case';
import { ChatAnastasiaUseCase } from './application/use-cases/chat-anastasia.use-case';
import { ChatElenaUseCase } from './application/use-cases/chat-elena.use-case';
import { GerarRelatorioUseCase } from './application/use-cases/gerar-relatorio.use-case';
import { SalvarConversaUseCase } from './application/use-cases/salvar-conversa.use-case';
import { SugerirComprasFeiraUseCase } from './application/use-cases/sugerir-compras-feira.use-case';
import { ListarPromptsUseCase } from './application/use-cases/listar-prompts.use-case';
import { AtualizarPromptUseCase } from './application/use-cases/atualizar-prompt.use-case';
import {
  AGENTES_DATA_REPOSITORY,
  AGENTE_PROMPTS_REPOSITORY,
  CONVERSA_REPOSITORY,
} from './domain/ports/injection-tokens';
import { AgentesDataRepository } from './infrastructure/database/typeorm/repositories/agentes-data.repository';
import { ConversaOrmEntity } from './infrastructure/database/typeorm/entities/conversa.orm-entity';
import { AgentePromptOrmEntity } from './infrastructure/database/typeorm/entities/agente-prompt.orm-entity';
import { ConversaRepository } from './infrastructure/database/typeorm/repositories/conversa.repository';
import { AgentePromptRepository } from './infrastructure/database/typeorm/repositories/agente-prompt.repository';
import { AgentesController } from './infrastructure/http/controllers/agentes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversaOrmEntity, AgentePromptOrmEntity]),
    AuthModule,
    // Reusa o CriarDemandaUseCase na tool registrar_demanda da Anastasia (RF-24).
    DemandasModule,
    // Tool avisar_vendedora: le a carteira do cliente, resolve a vendedora,
    // envia pelo WAHA e registra o evento. O gateway vem do modulo isolado
    // para nao fechar ciclo com o AtendimentoModule, que importa este aqui.
    ClientesModule,
    VendedorasModule,
    WhatsappGatewayModule,
    AgenteEventosModule,
    AtendimentosModule,
    LlmModule,
  ],
  controllers: [AgentesController],
  providers: [
    ChatAnastasiaUseCase,
    AvisarVendedoraUseCase,
    ChatElenaUseCase,
    GerarRelatorioUseCase,
    SugerirComprasFeiraUseCase,
    AnalisarProdutoUseCase,
    SalvarConversaUseCase,
    ListarPromptsUseCase,
    AtualizarPromptUseCase,
    { provide: CONVERSA_REPOSITORY, useClass: ConversaRepository },
    { provide: AGENTES_DATA_REPOSITORY, useClass: AgentesDataRepository },
    { provide: AGENTE_PROMPTS_REPOSITORY, useClass: AgentePromptRepository },
  ],
  // Exporta o LLM_CLIENT e o repo de prompts para o modulo de atendimento
  // (WhatsApp) reusar o mesmo cliente Anthropic e os overrides de prompt.
  // Reexporta o LlmModule para quem ja importava o AgentesModule por causa do
  // LLM_CLIENT (o modulo atendimento) continuar funcionando sem alteracao.
  exports: [LlmModule, AGENTE_PROMPTS_REPOSITORY],
})
export class AgentesModule {}
