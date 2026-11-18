import { substantivoDaLista } from './anthropic.client';

/**
 * ==========================================================================
 * "3 PEÇAS DEVOLVIDAS" — produção, 18/11/2026, 13:39.
 *
 * A pergunta foi *"quantas peças devolvidas em Novembro de 2026"*, e o texto
 * que a ferramenta entregou ao modelo dizia, com a palavra escrita por nós:
 *
 *   "São 3 VENDAS e somam R$ 32.966,00."
 *
 * Eram três DEVOLUÇÕES. A frase estava montada com `vendas` fixo, mesmo
 * quando o recorte pedido era `DEVOLVIDAS` — e o rótulo logo acima já dizia
 * "Devolucoes". O modelo recebeu os dois e escolheu uma terceira palavra:
 * "peças".
 *
 * É o padrão do dia: campo errado ou vazio na ferramenta vira frase
 * inventada pela agente. Aqui não estava nem vazio — estava errado.
 * ==========================================================================
 */
describe('o substantivo da lista diz o que a lista é', () => {
  it('sem recorte, são vendas', () => {
    expect(substantivoDaLista(undefined, 29)).toBe('vendas');
    expect(substantivoDaLista(undefined, 1)).toBe('venda');
  });

  /* ESTE É O TESTE. */
  it('pedindo as devolvidas, são devoluções — e nunca vendas', () => {
    expect(substantivoDaLista('DEVOLVIDAS', 3)).toBe('devoluções');
    expect(substantivoDaLista('DEVOLVIDAS', 1)).toBe('devolução');
    expect(substantivoDaLista('DEVOLVIDAS', 3)).not.toContain('venda');
  });

  it('pedindo tudo junto, a frase não escolhe um dos dois', () => {
    expect(substantivoDaLista('TODAS', 12)).toBe(
      'linhas entre vendas e devoluções',
    );
    expect(substantivoDaLista('TODAS', 1)).toBe(
      'linha entre venda e devolução',
    );
  });
});
