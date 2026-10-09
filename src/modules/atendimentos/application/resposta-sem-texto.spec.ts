import { respostaQuandoNaoVeioTexto } from './resposta-sem-texto';

/**
 * ==========================================================================
 * A AGENTE MOSTROU "DIGITANDO..." E NÃO MANDOU NADA — produção, 09/10/2026.
 *
 *   — "quem tem leads hoje"
 *   — "o 'hoje' na fila de leads só vale olhando por vendedora. Você quer a
 *      fila geral, ou os leads de uma vendedora específica?"
 *   — "geral"
 *   — (silêncio)
 *
 * O modelo devolveu resposta SEM TEXTO, o use case devolveu `resposta: ''`,
 * e o webhook — que trata `!resposta` como "não há o que responder" — não
 * enviou nada. A regra do webhook está certa para o canal do CLIENTE, onde
 * áudio vazio existe e o silêncio é adequado. No canal interno, quem
 * perguntou foi reconhecida, viu "digitando..." e ficou esperando.
 *
 * Mesma família do defeito do áudio em 21/08: "quem mandava não recebia nada
 * e nem sabia por quê". A resposta mais cara é a que não existe, porque
 * ninguém abre chamado por uma mensagem que não chegou.
 * ==========================================================================
 */
describe('a resposta quando o modelo não escreveu nada', () => {
  /* ESTE É O TESTE: nunca vazio, em motivo nenhum. */
  it('SEMPRE devolve uma frase — inclusive sem saber o motivo', () => {
    for (const motivo of [
      'max_tokens',
      'refusal',
      'outro',
      undefined,
    ] as const) {
      const frase = respostaQuandoNaoVeioTexto(motivo);
      expect(frase.trim().length).toBeGreaterThan(20);
    }
  });

  it('cortada por tamanho: diz para pedir MENOS, e não "tente de novo"', () => {
    // "Tente de novo" numa resposta cortada por tamanho repete o corte. O
    // que resolve é pedir menos — por vendedora, por dia, ou os primeiros.
    const frase = respostaQuandoNaoVeioTexto('max_tokens');

    expect(frase).toContain('menos');
    expect(frase).not.toMatch(/tente de novo/i);
  });

  it('recusa é dita como recusa, e não como falha', () => {
    const frase = respostaQuandoNaoVeioTexto('refusal');

    expect(frase).toContain('Não consigo responder');
  });

  it('motivo desconhecido não inventa causa', () => {
    // Sem saber por quê, a frase honesta é "me perdi" e um pedido de
    // repetição — não um diagnóstico chutado.
    const frase = respostaQuandoNaoVeioTexto(undefined);

    expect(frase).toContain('repetir');
    expect(frase).not.toContain('longa demais');
  });

  it('as três frases são diferentes entre si', () => {
    // Se as três fossem iguais, o motivo não serviria para nada — é o mesmo
    // defeito dos "três motivos, uma frase" dos lembretes, em 08/10.
    const frases = new Set([
      respostaQuandoNaoVeioTexto('max_tokens'),
      respostaQuandoNaoVeioTexto('refusal'),
      respostaQuandoNaoVeioTexto('outro'),
    ]);

    expect(frases.size).toBe(3);
  });
});
