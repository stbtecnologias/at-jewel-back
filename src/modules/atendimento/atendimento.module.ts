import { Module } from '@nestjs/common';
import { AgentesModule } from '../agentes/agentes.module';
import { AuthModule } from '../auth/auth.module';
import { AtendimentosModule } from '../atendimentos/atendimentos.module';
import { WhatsappWebhookController } from './infrastructure/http/controllers/whatsapp-webhook.controller';
import { WhatsappAdminController } from './infrastructure/http/controllers/whatsapp-admin.controller';
import { WahaAuthGuard } from './infrastructure/http/guards/waha-auth.guard';
import { WahaAdminClient } from './infrastructure/whatsapp/waha-admin.client';
import { TriagemClient } from './infrastructure/whatsapp/triagem.client';
import { WhatsappGatewayModule } from './whatsapp-gateway.module';

/**
 * Modulo de atendimento por WhatsApp (Anastasia). Orquestracao no backend
 * (n8n removido em 22/06): recebe o webhook do WAHA, gera a resposta com o LLM
 * (reusa o LLM_CLIENT exportado pelo AgentesModule) e envia de volta via WAHA.
 */
@Module({
  // AtendimentosModule traz o ProcessarMensagemInternaUseCase — o webhook
  // deste modulo passou a ser a porta do canal INTERNO (ADM e vendedoras).
  imports: [AgentesModule, AuthModule, WhatsappGatewayModule, AtendimentosModule],
  controllers: [WhatsappWebhookController, WhatsappAdminController],
  providers: [
    WahaAuthGuard,
    WahaAdminClient,
    // O repasse para a triagem: quem o canal interno nao reconhece e cliente,
    // e cliente e do `atwpp`. Ver o comentario da classe.
    TriagemClient,
  ],
})
export class AtendimentoModule {}
