import { Module } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from './domain/ports/injection-tokens';
import { SessoesDaCasaService } from './application/sessoes-da-casa.service';
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
 *
 * O `SessoesDaCasaService` mora aqui pelo mesmo motivo: nao depende de nada
 * alem do `ConfigService`, e quem precisa saber de qual numero uma mensagem
 * sai — gateway, conexoes, webhook e roteador — ja importa este modulo.
 */
@Module({
  providers: [
    SessoesDaCasaService,
    { provide: WHATSAPP_GATEWAY, useClass: WahaGateway },
  ],
  exports: [SessoesDaCasaService, WHATSAPP_GATEWAY],
})
export class WhatsappGatewayModule {}
