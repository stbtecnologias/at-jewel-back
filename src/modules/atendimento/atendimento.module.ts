import { Module } from '@nestjs/common';
import { AgentesModule } from '../agentes/agentes.module';
import { ProcessarMensagemWhatsappUseCase } from './application/use-cases/processar-mensagem-whatsapp.use-case';
import { WHATSAPP_GATEWAY } from './domain/ports/injection-tokens';
import { WhatsappWebhookController } from './infrastructure/http/controllers/whatsapp-webhook.controller';
import { WahaAuthGuard } from './infrastructure/http/guards/waha-auth.guard';
import { WahaGateway } from './infrastructure/whatsapp/waha.gateway';

/**
 * Modulo de atendimento por WhatsApp (Anastasia). Orquestracao no backend
 * (n8n removido em 22/06): recebe o webhook do WAHA, gera a resposta com o LLM
 * (reusa o LLM_CLIENT exportado pelo AgentesModule) e envia de volta via WAHA.
 */
@Module({
  imports: [AgentesModule],
  controllers: [WhatsappWebhookController],
  providers: [
    ProcessarMensagemWhatsappUseCase,
    WahaAuthGuard,
    { provide: WHATSAPP_GATEWAY, useClass: WahaGateway },
  ],
})
export class AtendimentoModule {}
