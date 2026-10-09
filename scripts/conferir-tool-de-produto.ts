/**
 * A TOOL DE PRODUTO, CONTRA A API DE VERDADE — 07/10/2026.
 *
 * ==========================================================================
 * "ME MONTA UMA TABELA DE PEÇAS ATÉ 20 MIL" — e a agente ficou MUDA.
 *
 * Silêncio não deixa pista: pode ser schema que a API recusou, exceção no
 * handler, ou a mensagem nem ter chegado. Este script tira a dúvida do meio
 * — monta a mesma chamada que o WhatsApp monta, com os MESMOS schemas, e
 * mostra o erro se houver.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-tool-de-produto.ts "pergunta"
 *
 * Gasta uma chamada de modelo. Não escreve nada no banco.
 */
import 'dotenv/config';
import { AnthropicClient } from '../src/modules/agentes/infrastructure/llm/anthropic.client';

async function main() {
  const pergunta = process.argv[2] ?? 'me monta uma tabela de peças até 20 mil';

  const config = {
    get: (chave: string) => process.env[chave],
  };
  const cliente = new AnthropicClient(config as never);

  let recebido: unknown = null;
  const resultado = await cliente.chatComFerramentas({
    model: 'claude-sonnet-4-5-20250929',
    system:
      'Voce e a Anastasia, assistente da gestao de uma joalheria. Use as ferramentas.',
    maxTokens: 1024,
    graficos: false,
    mensagens: [{ role: 'user', content: pergunta }],
    gestaoProdutos: async (entrada) => {
      recebido = entrada;
      return {
        produtos: [{ linha: 'ANEL TESTE — AN00001: R$ 19.900, 1 em estoque' }],
        total: 307,
        semEstoque: 0,
        incluiuSemEstoque: false,
        categoria: 'JEWEL',
        foraDaCategoria: 12,
        faixa: { ate: 20000 },
        pulados: 0,
      };
    },
  });

  console.log('\nA tool recebeu:', JSON.stringify(recebido, null, 2));
  console.log('\nA agente respondeu:\n' + resultado.texto);
}

main().catch((e: Error & { status?: number; error?: unknown }) => {
  console.error('\nFALHOU:', e.message);
  if (e.status) console.error('status HTTP:', e.status);
  if (e.error) console.error('corpo:', JSON.stringify(e.error, null, 2));
  process.exit(1);
});
