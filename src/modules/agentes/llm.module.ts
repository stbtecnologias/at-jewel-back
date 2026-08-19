import { Module } from '@nestjs/common';
import { LLM_CLIENT } from './domain/ports/injection-tokens';
import { AnthropicClient } from './infrastructure/llm/anthropic.client';

/**
 * So o cliente de LLM, isolado num modulo proprio.
 *
 * POR QUE SEPARADO: o `AgentesModule` importa o `AtendimentosModule` (a tool
 * `avisar_vendedora` abre o atendimento). Quando o canal interno passou a
 * precisar do LLM para extrair o relato da vendedora, o caminho direto seria o
 * AtendimentosModule importar o AgentesModule — e o Nest recusou o ciclo:
 *
 *     UndefinedModuleException: Nest cannot create the AtendimentosModule
 *     instance. A circular dependency between modules.
 *
 * Este modulo nao importa nada, entao os dois podem importa-lo sem ciclo.
 * Mesma solucao do WhatsappGatewayModule, pelo mesmo motivo.
 */
@Module({
  providers: [{ provide: LLM_CLIENT, useClass: AnthropicClient }],
  exports: [LLM_CLIENT],
})
export class LlmModule {}
