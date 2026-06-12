import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AnalisarProdutoUseCase } from './application/use-cases/analisar-produto.use-case';
import { ChatAnastasiaUseCase } from './application/use-cases/chat-anastasia.use-case';
import { ChatElenaUseCase } from './application/use-cases/chat-elena.use-case';
import { GerarRelatorioUseCase } from './application/use-cases/gerar-relatorio.use-case';
import { SalvarConversaUseCase } from './application/use-cases/salvar-conversa.use-case';
import { SugerirComprasFeiraUseCase } from './application/use-cases/sugerir-compras-feira.use-case';
import {
  AGENTES_DATA_REPOSITORY,
  CONVERSA_REPOSITORY,
  LLM_CLIENT,
} from './domain/ports/injection-tokens';
import { AgentesDataRepository } from './infrastructure/database/typeorm/repositories/agentes-data.repository';
import { ConversaOrmEntity } from './infrastructure/database/typeorm/entities/conversa.orm-entity';
import { ConversaRepository } from './infrastructure/database/typeorm/repositories/conversa.repository';
import { AnthropicClient } from './infrastructure/llm/anthropic.client';
import { AgentesController } from './infrastructure/http/controllers/agentes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConversaOrmEntity]), AuthModule],
  controllers: [AgentesController],
  providers: [
    ChatAnastasiaUseCase,
    ChatElenaUseCase,
    GerarRelatorioUseCase,
    SugerirComprasFeiraUseCase,
    AnalisarProdutoUseCase,
    SalvarConversaUseCase,
    { provide: LLM_CLIENT, useClass: AnthropicClient },
    { provide: CONVERSA_REPOSITORY, useClass: ConversaRepository },
    { provide: AGENTES_DATA_REPOSITORY, useClass: AgentesDataRepository },
  ],
})
export class AgentesModule {}
