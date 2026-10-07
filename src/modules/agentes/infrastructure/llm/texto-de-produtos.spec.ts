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

/**
 * ==========================================================================
 * A SEGUNDA RODADA DO MESMO TESTE, 07/10 — com a lista JÁ aberta.
 *
 *   — "tem alguma esmeralda sem estoque?"
 *   — "As 6 primeiras que apareceram estão todas com estoque, mas são 112
 *      peças no total — não dá para afirmar que nenhuma zerou só por essas."
 *
 * Ela ligou o `incluir_sem_estoque` (certo), recebeu as 112 (certo) e não
 * recebeu o 103 (errado) — porque o contador era zerado quando a lista vinha
 * aberta. O número que faltava é o único que respondia a pergunta.
 * ==========================================================================
 */
describe('textoDeProdutos — quando a lista já inclui as zeradas', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('diz quantas das achadas estão sem estoque', () => {
    const texto = textoDeProdutos(
      {
        produtos: [1, 2, 3, 4, 5, 6].map(peca),
        total: 112,
        semEstoque: 103,
        incluiuSemEstoque: true,
      },
      FECHO,
    );

    expect(texto).toContain('DESTAS 112, 103 estao SEM ESTOQUE');
    expect(texto).toContain('9 tem saldo');
    // E não pode mandar ligar de novo o que já está ligado.
    expect(texto).not.toContain('chame a ferramenta de novo com incluir_sem_estoque');
  });

  it('não repete a oferta de abrir a lista que já está aberta', () => {
    const texto = textoDeProdutos(
      { produtos: [], total: 0, semEstoque: 5, incluiuSemEstoque: true },
      FECHO,
    );

    expect(texto).toContain('Nenhuma peca encontrada');
  });
});

/**
 * ==========================================================================
 * O RECORTE DE CATEGORIA ESCONDE PEÇA — e precisa dizer que escondeu.
 *
 * Mesmo risco do teto e do filtro de saldo, terceira vez no mesmo dia: com o
 * padrão JEWEL, perguntar por "vaso" acha zero joias — e seria falso dizer
 * que não existe vaso. Existem, em HOME.
 * ==========================================================================
 */
describe('textoDeProdutos — o que a categoria deixou de fora', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('lista vazia por causa da categoria NÃO diz que não encontrou', () => {
    const texto = textoDeProdutos(
      {
        produtos: [],
        total: 0,
        semEstoque: 0,
        categoria: 'JEWEL',
        foraDaCategoria: 14,
      },
      FECHO,
    );

    expect(texto).toContain('14');
    expect(texto).toContain('OUTRAS categorias');
    expect(texto).toContain('categoria = TODAS');
    expect(texto).not.toContain('Nenhuma peca encontrada');
  });

  it('diz em que categoria a lista está', () => {
    const texto = textoDeProdutos(
      {
        produtos: [peca(1), peca(2)],
        total: 2,
        semEstoque: 0,
        categoria: 'JEWEL',
        foraDaCategoria: 7,
      },
      FECHO,
    );

    expect(texto).toContain('recortada em JOIA');
    expect(texto).toContain('7 existem em OUTRAS categorias');
  });

  it('sem recorte, não fala de categoria nenhuma', () => {
    const texto = textoDeProdutos(
      { produtos: [peca(1)], total: 1, semEstoque: 0, foraDaCategoria: 0 },
      FECHO,
    );

    expect(texto).not.toContain('recortada');
    // `TODAS` sozinho passou a aparecer no cabecalho da lista ("LISTE TODAS"),
    // entao o que se guarda aqui e a OFERTA de trocar de categoria.
    expect(texto).not.toContain('categoria = TODAS');
  });

  /** Os dois recortes juntos: a resposta tem de citar os dois caminhos. */
  it('estoque e categoria escondendo ao mesmo tempo', () => {
    const texto = textoDeProdutos(
      {
        produtos: [],
        total: 0,
        semEstoque: 103,
        categoria: 'JEWEL',
        foraDaCategoria: 7,
      },
      FECHO,
    );

    expect(texto).toContain('103');
    expect(texto).toContain('7');
    expect(texto).toContain('incluir_sem_estoque');
    expect(texto).toContain('categoria = TODAS');
  });
});

/**
 * A faixa da lista é a mesma da carteira, de 05/10 — agora que os produtos
 * também têm `a_partir_de`. O teste guarda o que ela precisa dizer: onde a
 * lista parou, quantas faltam, e o valor exato do próximo pedido.
 */
describe('textoDeProdutos — a continuação da lista', () => {
  it('diz a faixa e como pedir o resto', () => {
    const texto = textoDeProdutos(
      {
        produtos: Array.from({ length: 20 }, (_, i) => peca(i)),
        total: 97,
        semEstoque: 0,
        foraDaCategoria: 0,
      },
      FECHO,
    );

    expect(texto).toContain('97');
    expect(texto).toContain('a_partir_de = 20');
  });

  it('na última página, avisa que acabou', () => {
    const texto = textoDeProdutos(
      {
        produtos: [peca(1), peca(2), peca(3)],
        total: 9,
        semEstoque: 0,
        foraDaCategoria: 0,
        pulados: 6,
      },
      FECHO,
    );

    expect(texto).toContain('ULTIMOS');
    expect(texto).not.toContain('a_partir_de =');
  });

  it('diz a faixa de preço aplicada', () => {
    const texto = textoDeProdutos(
      {
        produtos: [peca(1)],
        total: 1,
        semEstoque: 0,
        foraDaCategoria: 0,
        categoria: 'JEWEL',
        faixa: { ate: 20000 },
      },
      FECHO,
    );

    expect(texto).toContain('recortada em JOIA');
    expect(texto).toContain('20.000');
  });
});

/**
 * ==========================================================================
 * "AQUI OS 20 PRIMEIROS" — E LISTOU DEZ. 07/10/2026, pelo WhatsApp.
 *
 * A ferramenta devolveu vinte peças; a agente anunciou vinte e escreveu dez.
 * Parece estética, e não é: a continuação que ela ofereceu é
 * `a_partir_de = 20`, então as peças 11 a 20 desapareceriam entre uma página
 * e outra — sem erro, sem aviso, sem ninguém ver.
 *
 * O teto caiu para dez (o tamanho que ela já escolhia sozinha), e o texto
 * passou a dizer quantas vieram e a mandar listar todas. As duas coisas:
 * uma para caber, outra para cobrar.
 * ==========================================================================
 */
describe('textoDeProdutos — mostrar menos do que veio quebra a página', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('diz quantas vieram e manda listar todas', () => {
    const texto = textoDeProdutos(
      {
        produtos: [1, 2, 3].map(peca),
        total: 91,
        semEstoque: 0,
        foraDaCategoria: 0,
      },
      FECHO,
    );

    expect(texto).toContain('3 nesta lista');
    expect(texto).toContain('LISTE TODAS');
  });

  it('a continuação pedida bate com o que veio', () => {
    const texto = textoDeProdutos(
      {
        produtos: Array.from({ length: 10 }, (_, i) => peca(i)),
        total: 91,
        semEstoque: 0,
        foraDaCategoria: 0,
      },
      FECHO,
    );

    expect(texto).toContain('10 nesta lista');
    expect(texto).toContain('a_partir_de = 10');
  });
});
