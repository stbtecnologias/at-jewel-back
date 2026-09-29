import { Module } from '@nestjs/common';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { ConexoesService } from './application/conexoes.service';
import { WahaAdminClient } from './infrastructure/whatsapp/waha-admin.client';
import { WhatsappGatewayModule } from './whatsapp-gateway.module';

/**
 * A API administrativa do WAHA, num modulo-folha — 29/09/2026.
 *
 * ==========================================================================
 * EXISTE PARA QUEBRAR UM CICLO, E NAO POR ARQUITETURA.
 *
 * `AtendimentoModule` (singular) importa `AtendimentosModule` (plural). Quando
 * o `FerramentasGestaoService` — que mora no plural — passou a precisar do
 * `AnalisarTomUseCase`, que precisa do WAHA admin do singular, o plural teria
 * de importar o singular: ciclo.
 *
 * Mesma solucao do `WhatsappGatewayModule` e do `CombinadosModule`: o pedaco
 * compartilhado sai para uma folha que os dois lados importam. `ConexoesService`
 * e `WahaAdminClient` nao dependem de nenhum dos dois — so de `SessoesDaCasaService`
 * (que ja e folha) e do repositorio de vendedoras.
 *
 * O que NAO fazer aqui: `forwardRef`. Ele faz o ciclo compilar e deixa a ordem
 * de inicializacao dependendo de quem e instanciado primeiro — o tipo de
 * defeito que aparece em producao, no boot, e nao no teste.
 * ==========================================================================
 */
@Module({
  imports: [WhatsappGatewayModule, VendedorasModule],
  providers: [WahaAdminClient, ConexoesService],
  exports: [WahaAdminClient, ConexoesService],
})
export class WahaAdminModule {}
