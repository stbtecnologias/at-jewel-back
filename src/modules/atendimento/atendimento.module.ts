import { Module } from '@nestjs/common';
import { AgentesModule } from '../agentes/agentes.module';
import { AuthModule } from '../auth/auth.module';
import { ProcessarMensagemWhatsappUseCase } from './application/use-cases/processar-mensagem-whatsapp.use-case';
import { WhatsappWebhookController } from './infrastructure/http/controllers/whatsapp-webhook.controller';
import { WhatsappAdminController } from './infrastructure/http/controllers/whatsapp-admin.controller';
import { WahaAuthGuard } from './infrastructure/http/guards/waha-auth.guard';
import { WahaAdminClient } from './infrastructure/whatsapp/waha-admin.client';
import { WhatsappGatewayModule } from './whatsapp-gateway.module';

/**
 * Modulo de atendimento por WhatsApp (Anastasia). Orquestracao no backend
 * (n8n removido em 22/06): recebe o webhook do WAHA, gera a resposta com o LLM
 * (reusa o LLM_CLIENT exportado pelo AgentesModule) e envia de volta via WAHA.
 */
@Module({
  imports: [AgentesModule, AuthModule, WhatsappGatewayModule],
  controllers: [WhatsappWebhookController, WhatsappAdminController],
  providers: [
    ProcessarMensagemWhatsappUseCase,
    WahaAuthGuard,
    WahaAdminClient,
  ],
})
export class AtendimentoModule {}
