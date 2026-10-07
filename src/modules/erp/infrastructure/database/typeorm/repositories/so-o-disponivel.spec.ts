import { Brackets } from 'typeorm';
import { ProdutoRepository } from './produto.repository';

/**
 * ==========================================================================
 * "A CONSULTA RETORNA MILHARES DE ITENS SEM ESTOQUE" — reunião de 06/10/2026.
 *
 * Medido na base no dia seguinte: **7.196 produtos ativos, 546 com saldo**.
 * A busca filtrava `ativo` e nunca olhava saldo, então nove de cada dez
 * respostas eram peça que a loja não tem.
 *
 * A decisão do Lucas, em 07/10, tem duas metades — e a segunda é a que este
 * arquivo guarda:
 *
 *   1. a busca traz só o DISPONÍVEL;
 *   2. **o código exato acha a peça assim mesmo**, com ou sem estoque.
 *      Veio do AN24084: peça sem saldo que a gestora precisava consultar.
 *
 * As duas metades vivem na MESMA consulta, e é por isso que o lugar do
 * filtro importa: ele fica dentro do ramo das PALAVRAS, e o ramo do CÓDIGO
 * passa por fora, no outro lado do OR.
 *
 * SUBIR O FILTRO UM NÍVEL — para o `andWhere` do topo, que é onde ele
 * pareceria pertencer — não quebra nada que dê erro: a consulta continua
 * válida, os outros testes passam, e o AN24084 volta a sumir em silêncio.
 * Por isso aqui se testa a ESTRUTURA, e não só o resultado.
 * ==========================================================================
 */

type No = { condicao: string; filhos: No[] };

/**
 * Um `QueryBuilder` que não fala com banco nenhum: só anota em que nível cada
 * condição entrou. `Brackets` vira um nó com filhos — que é exatamente o que
 * precisa ser verificado.
 */
/** A ordenação e o salto, que não são condições mas decidem a página. */
type Leitura = { ordem: string[]; pulou: number };

function construtorQueAnota() {
  const raiz: No = { condicao: 'RAIZ', filhos: [] };
  const leitura: Leitura = { ordem: [], pulou: 0 };

  const construir = (no: No) => {
    const anotar = (condicao: unknown) => {
      if (condicao instanceof Brackets) {
        const grupo: No = { condicao: 'GRUPO', filhos: [] };
        no.filhos.push(grupo);
        condicao.whereFactory(construir(grupo) as never);
      } else {
        no.filhos.push({ condicao: String(condicao), filhos: [] });
      }
      return qb;
    };
    const ordenar = (coluna: string, sentido = 'ASC') => {
      leitura.ordem.push(`${coluna} ${sentido}`);
      return qb;
    };
    const qb = {
      where: anotar,
      andWhere: anotar,
      orWhere: anotar,
      orderBy: ordenar,
      addOrderBy: ordenar,
      skip: (n: number) => {
        leitura.pulou = n;
        return qb;
      },
      take: () => qb,
      getMany: async () => [],
    };
    return qb;
  };

  return { qb: construir(raiz), raiz, leitura };
}

function repositorioFalso() {
  const { qb, raiz, leitura } = construtorQueAnota();
  const repo = new ProdutoRepository({
    createQueryBuilder: () => qb,
    manager: { query: async () => [] },
  } as never);
  return { repo, raiz, leitura };
}

const TEM_SALDO = /HAVING SUM\(quantidade\) > 0/;
const TEM_CODIGO = /codigosDaBusca/;

/** Todas as condições da árvore, sem olhar nível. */
function todas(no: No): string[] {
  return [no.condicao, ...no.filhos.flatMap(todas)];
}

/**
 * O grupo MAIS FUNDO que ainda contém a condição.
 *
 * Tem de ser o mais fundo: o grupo de cima é o OR inteiro, e ele contém o
 * saldo e o código os dois — o que faria o teste passar sempre, inclusive
 * com o defeito de volta.
 */
function grupoMaisFundoCom(no: No, padrao: RegExp): No {
  for (const filho of no.filhos) {
    if (filho.filhos.length > 0 && todas(filho).some((c) => padrao.test(c))) {
      return grupoMaisFundoCom(filho, padrao);
    }
  }
  return no;
}

describe('findAll — só o disponível, menos quando o código é exato', () => {
  it('não filtra saldo nenhum quando não pedem', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'anel de esmeralda', ativo: true });

    expect(todas(raiz).some((c) => TEM_SALDO.test(c))).toBe(false);
  });

  it('filtra saldo numa busca por palavras', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({
      busca: 'anel de esmeralda',
      ativo: true,
      apenasDisponiveis: true,
    });

    expect(todas(raiz).some((c) => TEM_SALDO.test(c))).toBe(true);
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('o ramo do CÓDIGO não carrega o filtro de saldo junto', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({
      busca: 'An24084 me dá a descrição desse produto',
      ativo: true,
      apenasDisponiveis: true,
    });

    const grupoDoSaldo = grupoMaisFundoCom(raiz, TEM_SALDO);
    expect(todas(grupoDoSaldo).some((c) => TEM_SALDO.test(c))).toBe(true);

    // O código está na consulta...
    expect(todas(raiz).some((c) => TEM_CODIGO.test(c))).toBe(true);
    // ...e NÃO está debaixo do mesmo grupo que o saldo. Se estivesse, a peça
    // sem estoque voltaria a sumir — que é o defeito de 06/10.
    expect(todas(grupoDoSaldo).some((c) => TEM_CODIGO.test(c))).toBe(false);
  });

  /**
   * A outra metade da mesma armadilha: o filtro não pode estar no topo.
   * No topo ele vale para a consulta inteira — inclusive para o ramo do
   * código, que é o único que não pode tê-lo.
   */
  it('o filtro de saldo não fica no nível de cima quando há busca', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({
      busca: 'An24084',
      ativo: true,
      apenasDisponiveis: true,
    });

    const noTopo = raiz.filhos.filter((f) => TEM_SALDO.test(f.condicao));
    expect(noTopo).toHaveLength(0);
  });

  /**
   * Sem busca não há ramo de código para preservar — a listagem do painel —,
   * e aí o filtro é direto. Se ele sumisse neste caminho, a tela de Produtos
   * filtrada por "disponíveis" mostraria o catálogo inteiro.
   */
  it('sem busca nenhuma, o filtro entra direto', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ ativo: true, apenasDisponiveis: true });

    expect(raiz.filhos.some((f) => TEM_SALDO.test(f.condicao))).toBe(true);
  });
});

/**
 * ==========================================================================
 * A CATEGORIA ENTRA PELO MESMO LUGAR QUE O SALDO — 07/10/2026.
 *
 * E tem de entrar, porque esconde peça do mesmo jeito. Com o padrão JEWEL no
 * topo da consulta, "me dá a descrição do C795VES" — um cilindro, categoria
 * HOME — voltaria vazio, e a agente diria que o código não existe. É o
 * AN24084 de novo, com outra coluna.
 * ==========================================================================
 */
describe('findAll — a categoria sugerida também passa por fora do código', () => {
  const TEM_CATEGORIA = /categoriaSugerida/;

  it('recorta por categoria numa busca por palavras', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({
      busca: 'anel de esmeralda',
      ativo: true,
      categoriaSugerida: 'JEWEL',
    });

    expect(todas(raiz).some((c) => TEM_CATEGORIA.test(c))).toBe(true);
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('o ramo do CÓDIGO não carrega o recorte de categoria', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({
      busca: 'me dá a descrição do C795VES',
      ativo: true,
      categoriaSugerida: 'JEWEL',
      apenasDisponiveis: true,
    });

    const grupo = grupoMaisFundoCom(raiz, TEM_CATEGORIA);
    expect(todas(grupo).some((c) => TEM_CATEGORIA.test(c))).toBe(true);
    expect(todas(grupo).some((c) => TEM_CODIGO.test(c))).toBe(false);
  });

  it('não fica no nível de cima quando há busca', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({
      busca: 'C795VES',
      ativo: true,
      categoriaSugerida: 'JEWEL',
    });

    expect(raiz.filhos.filter((f) => TEM_CATEGORIA.test(f.condicao))).toHaveLength(0);
  });

  /**
   * O filtro DURO da tela de Produtos é outro campo (`categoria`) e continua
   * no topo: ali a pessoa escolheu num seletor, e nada deve furar isso.
   */
  it('o filtro duro da tela continua valendo para a consulta inteira', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'C795VES', ativo: true, categoria: 'HOME' });

    expect(raiz.filhos.some((f) => /p\.categoria = :categoria\b/.test(f.condicao))).toBe(true);
  });
});

/**
 * ==========================================================================
 * A FAIXA DE PREÇO E A PÁGINA 2 — 07/10/2026.
 *
 * "Quero puxar uma tabela de peças até 20 mil reais" — a gestora, em 07/10,
 * e a Anastasia respondeu que não conseguia. E depois, pedindo as três que
 * faltavam de nove: *"a busca só me devolve essas 6 primeiras de cada vez"*.
 *
 * O desempate da ordenação é o que faz a página 2 ser a página 2. Sem ele,
 * duas peças do mesmo preço podem trocar de lugar entre uma consulta e
 * outra: uma repete e outra desaparece — sem erro nenhum. Foi o conserto da
 * carteira em 05/10, e aqui a faixa de preço torna o empate COMUM, porque
 * preço repetido é regra no catálogo, não exceção.
 * ==========================================================================
 */
describe('findAll — faixa de preço e paginação', () => {
  const TEM_PRECO = /valor_venda/;

  it('filtra pela faixa numa busca por palavras', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'colar', ativo: true, precoAte: 20000 });

    expect(todas(raiz).some((c) => TEM_PRECO.test(c))).toBe(true);
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('o ramo do CÓDIGO não carrega a faixa de preço', async () => {
    const { repo, raiz } = repositorioFalso();

    // A peça custa R$ 37.900 e a faixa pedida vai até 20 mil. Quem digita o
    // código quer AQUELA peça, e não "aquela peça se couber no orçamento".
    await repo.findAll({
      busca: 'quanto custa o AN24084',
      ativo: true,
      precoAte: 20000,
    });

    const grupo = grupoMaisFundoCom(raiz, TEM_PRECO);
    expect(todas(grupo).some((c) => TEM_PRECO.test(c))).toBe(true);
    expect(todas(grupo).some((c) => TEM_CODIGO.test(c))).toBe(false);
  });

  it('o desempate por id está sempre lá', async () => {
    const { repo, leitura } = repositorioFalso();

    await repo.findAll({ busca: 'colar', ativo: true, deslocamento: 20 });

    expect(leitura.ordem[leitura.ordem.length - 1]).toBe('p.id ASC');
  });

  it('com faixa de preço, a lista vem do mais barato', async () => {
    const { repo, leitura } = repositorioFalso();

    await repo.findAll({ busca: 'colar', ativo: true, precoAte: 20000 });

    expect(leitura.ordem[0]).toBe('p.valor_venda ASC');
    expect(leitura.ordem[1]).toBe('p.id ASC');
  });

  it('sem faixa, segue a entrada mais recente primeiro', async () => {
    const { repo, leitura } = repositorioFalso();

    await repo.findAll({ busca: 'colar', ativo: true });

    expect(leitura.ordem[0]).toBe('p.criado_em DESC');
  });

  it('o salto da página chega inteiro', async () => {
    const { repo, leitura } = repositorioFalso();

    await repo.findAll({ busca: 'colar', ativo: true, deslocamento: 20 });

    expect(leitura.pulou).toBe(20);
  });

  it('salto negativo ou quebrado não vira salto', async () => {
    const { repo, leitura } = repositorioFalso();

    await repo.findAll({ busca: 'colar', ativo: true, deslocamento: -5 });

    expect(leitura.pulou).toBe(0);
  });
});
