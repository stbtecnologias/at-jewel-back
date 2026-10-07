import { textoDeProdutos } from './anthropic.client';

/**
 * ==========================================================================
 * AS DUAS RESPOSTAS ERRADAS DE 07/10/2026 — e elas são o teste.
 *
 * Primeiro teste do filtro de saldo, pelo WhatsApp, com o Lucas:
 *
 *   — "tem alguma esmeralda sem estoque?"
 *   — "Nenhuma esmeralda está sem estoque — todas as SEIS peças que aparecem
 *      no catálogo estão disponíveis."
 *
 *   — "brinco de diamante"
 *   — "Não achei nenhum brinco de diamante em estoque."
 *
 * São 112 esmeraldas (9 com saldo) e 22 brincos de diamante (nenhum com
 * saldo). O modelo não tinha como acertar: recebeu a lista já cortada e
 * nenhum número em volta dela.
 *
 * É a mesma família do teto da carteira (21/08) e da faixa da lista (05/10).
 * O que muda aqui é que o corte não é só de TAMANHO, é de CRITÉRIO: as peças
 * que sumiram não estão "mais adiante na lista", elas foram filtradas — e
 * sem dizer isso, "não achei" vira mentira.
 * ==========================================================================
 */

const FECHO = 'Repasse os numeros exatamente como estao.';
const peca = (n: number) => ({ linha: `PECA ${n}: R$ 1.000,00, disponivel` });

describe('textoDeProdutos — o que a agente ouve depois da busca', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('lista vazia com peças zeradas NÃO diz que não encontrou', () => {
    const texto = textoDeProdutos(
      { produtos: [], total: 0, semEstoque: 22 },
      FECHO,
    );

    expect(texto).toContain('22');
    expect(texto).toContain('SEM ESTOQUE');
    expect(texto).toContain('incluir_sem_estoque');
    // A frase que produziu o "não achei nenhum brinco de diamante".
    expect(texto).not.toContain('Nenhuma peca encontrada');
  });

  it('lista vazia de verdade continua dizendo que não achou', () => {
    const texto = textoDeProdutos(
      { produtos: [], total: 0, semEstoque: 0 },
      FECHO,
    );

    expect(texto).toContain('Nenhuma peca encontrada');
    expect(texto).not.toContain('incluir_sem_estoque');
  });

  /**
   * O "todas as seis peças que aparecem no catálogo": seis é o teto, nove é
   * o total. Sem o total na mão, o modelo fala das seis como se fossem tudo.
   */
  it('diz o total quando a lista veio cortada pelo teto', () => {
    const texto = textoDeProdutos(
      { produtos: [1, 2, 3, 4, 5, 6].map(peca), total: 9, semEstoque: 103 },
      FECHO,
    );

    expect(texto).toContain('SAO 9 NO TOTAL');
    expect(texto).toContain('103');
  });

  it('não inventa total quando a lista está inteira', () => {
    const texto = textoDeProdutos(
      { produtos: [peca(1)], total: 1, semEstoque: 0 },
      FECHO,
    );

    expect(texto).not.toContain('NO TOTAL');
    expect(texto).not.toContain('SEM ESTOQUE');
    expect(texto).toContain(FECHO);
  });

  /**
   * Quando ela PEDIU o indisponível, `semEstoque` vem zero — não há o que
   * ficar de fora. O texto não pode oferecer de novo o que ela já ligou.
   */
  it('com o indisponível ligado, não oferece ligar de novo', () => {
    const texto = textoDeProdutos(
      { produtos: [peca(1), peca(2)], total: 2, semEstoque: 0 },
      FECHO,
    );

    expect(texto).not.toContain('incluir_sem_estoque');
  });
});
