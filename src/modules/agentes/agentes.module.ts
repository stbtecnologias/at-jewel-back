import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
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
  LLM_CLIENT,
} from './domain/ports/injection-tokens';
import { AgentesDataRepository } from './infrastructure/database/typeorm/repositories/agentes-data.repository';
import { ConversaOrmEntity } from './infrastructure/database/typeorm/entities/conversa.orm-entity';
import { AgentePromptOrmEntity } from './infrastructure/database/typeorm/entities/agente-prompt.orm-entity';
import { ConversaRepository } from './infrastructure/database/typeorm/repositories/conversa.repository';
import { AgentePromptRepository } from './infrastructure/database/typeorm/repositories/agente-prompt.repository';
import { AnthropicClient } from './infrastructure/llm/anthropic.client';
import { AgentesController } from './infrastructure/http/controllers/agentes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversaOrmEntity, AgentePromptOrmEntity]),
    AuthModule,
  ],
  controllers: [AgentesController],
  providers: [
    ChatAnastasiaUseCase,
    ChatElenaUseCase,
    GerarRelatorioUseCase,
    SugerirComprasFeiraUseCase,
    AnalisarProdutoUseCase,
    SalvarConversaUseCase,
    ListarPromptsUseCase,
    AtualizarPromptUseCase,
    { provide: LLM_CLIENT, useClass: AnthropicClient },
    { provide: CONVERSA_REPOSITORY, useClass: ConversaRepository },
    { provide: AGENTES_DATA_REPOSITORY, useClass: AgentesDataRepository },
    { provide: AGENTE_PROMPTS_REPOSITORY, useClass: AgentePromptRepository },
  ],
  // Exporta o LLM_CLIENT e o repo de prompts para o modulo de atendimento
  // (WhatsApp) reusar o mesmo cliente Anthropic e os overrides de prompt.
  exports: [LLM_CLIENT, AGENTE_PROMPTS_REPOSITORY],
})
export class AgentesModule {}
