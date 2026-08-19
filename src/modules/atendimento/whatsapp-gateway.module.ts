import { Module } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from './domain/ports/injection-tokens';
import { WahaGateway } from './infrastructure/whatsapp/waha.gateway';

/**
 * So o gateway de envio, isolado num modulo proprio.
 *
 * POR QUE SEPARADO: o `AtendimentoModule` importa o `AgentesModule` (reusa o
 * LLM_CLIENT). Quando a Anastasia do painel passou a precisar ENVIAR WhatsApp
 * — a tool `avisar_vendedora` —, o caminho direto seria o AgentesModule
 * importar o AtendimentoModule, fechando um ciclo.
 *
 * Este modulo nao importa nada, entao os dois podem importa-lo sem ciclo.
 */
@Module({
  providers: [{ provide: WHATSAPP_GATEWAY, useClass: WahaGateway }],
  exports: [WHATSAPP_GATEWAY],
})
export class WhatsappGatewayModule {}
