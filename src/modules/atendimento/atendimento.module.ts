import { Module } from '@nestjs/common';
import { AgentesModule } from '../agentes/agentes.module';
import { AuthModule } from '../auth/auth.module';
import { AtendimentosModule } from '../atendimentos/atendimentos.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { WhatsappWebhookController } from './infrastructure/http/controllers/whatsapp-webhook.controller';
import { WhatsappAdminController } from './infrastructure/http/controllers/whatsapp-admin.controller';
import { WahaAuthGuard } from './infrastructure/http/guards/waha-auth.guard';
import { WahaAdminClient } from './infrastructure/whatsapp/waha-admin.client';
import { TriagemClient } from './infrastructure/whatsapp/triagem.client';
import { ConexoesService } from './application/conexoes.service';
import { WhatsappGatewayModule } from './whatsapp-gateway.module';

/**
 * Modulo de atendimento por WhatsApp (Anastasia). Orquestracao no backend
 * (n8n removido em 22/06): recebe o webhook do WAHA, gera a resposta com o LLM
 * (reusa o LLM_CLIENT exportado pelo AgentesModule) e envia de volta via WAHA.
 */
@Module({
  // AtendimentosModule traz o ProcessarMensagemInternaUseCase — o webhook
  // deste modulo passou a ser a porta do canal INTERNO (ADM e vendedoras).
  // VendedorasModule: a lista de conexoes e DERIVADA da tabela de
  // vendedoras — cadastrar uma ja faz a linha dela aparecer com o QR.
  // Sem ciclo: o AtendimentosModule (plural) ja o importa, e ninguem
  // importa este modulo alem do AppModule.
  imports: [
    AgentesModule,
    AuthModule,
    WhatsappGatewayModule,
    AtendimentosModule,
    VendedorasModule,
  ],
  controllers: [WhatsappWebhookController, WhatsappAdminController],
  providers: [
    WahaAuthGuard,
    WahaAdminClient,
    ConexoesService,
    // O repasse para a triagem: quem o canal interno nao reconhece e cliente,
    // e cliente e do `atwpp`. Ver o comentario da classe.
    TriagemClient,
  ],
})
export class AtendimentoModule {}
