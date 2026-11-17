import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { moeda } from '../../../shared/formato/moeda';

/**
 * A QUEBRA POR TIPO DE OURO, NA FERRAMENTA — 16/11/2026.
 *
 * ==========================================================================
 * A PERGUNTA QUE A AGENTE NAO SABIA RESPONDER.
 *
 * A gestora perguntou, em 15/11, o que vendia mais: ouro branco ou amarelo. A
 * Anastasia respondeu com precisao que nao conseguia — "minha busca de 'quem
 * mais vende' conta por tipo de peca, nao por tipo de ouro" —, e estava
 * certa: a ferramenta recebe UM parametro, `familia`.
 *
 * O dado estava na base o tempo todo. Faltava alcance.
 * ==========================================================================
 */
function naoParaTudo(nome: string) {
  return new Proxy(
    {},
    {
      get: () => {
        throw new Error(`o teste encostou em ${nome}, e não devia`);
      },
    },
  );
}

function montar(linhas: { metal: string; quantidade: number; valor: number }[]) {
  // A quebra passou a devolver `{ linhas, periodo }` em 16/11: uma resposta
  // vazia que nao diz de quando convida o modelo a inventar o recorte.
  const porMetal = jest
    .fn()
    .mockResolvedValue({ linhas, periodo: 'o histórico inteiro' });

  const deps = Array.from({ length: 32 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  // O `consultarVendas` e o SEGUNDO parametro do construtor.
  deps[1] = { porMetal } as never;

  const servico = new FerramentasGestaoService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasGestaoService
    >),
  );
  return { servico, porMetal };
}

describe('vendas por tipo de ouro', () => {
  it('a linha traz as pecas e o valor com centavo', async () => {
    const { servico } = montar([
      { metal: 'Ouro branco', quantidade: 200, valor: 11001864.62 },
      { metal: 'Ouro amarelo', quantidade: 187, valor: 5944493.26 },
    ]);

    const r = await servico.montar({ verLoja: true }).gestaoPorMetal({});

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([
      `Ouro branco: 200 peças — ${moeda(11001864.62)}`,
      `Ouro amarelo: 187 peças — ${moeda(5944493.26)}`,
    ]);
  });

  it('uma peca no singular', async () => {
    const { servico } = montar([
      { metal: 'Ouro rose', quantidade: 1, valor: 1990 },
    ]);

    const r = await servico.montar({ verLoja: true }).gestaoPorMetal({});

    expect(r.linhas).toEqual([`Ouro rose: 1 peça — ${moeda(1990)}`]);
  });

  /**
   * O `pg` DEVOLVE `NUMERIC` COMO TEXTO, e `quantidade` e DECIMAL(10,4): sem
   * a conversao do repositorio, a linha sairia "200.0000 peças".
   *
   * NAO HA TRATAMENTO DE FRACAO, e e deliberado: medido em 16/11, dos 2.383
   * itens de movimentacao ativos, ZERO tem quantidade fracionaria — joia sai
   * em peca inteira. Quem um dia vender a grama volta aqui.
   */
  it('a quantidade sai inteira, sem o rastro do NUMERIC', async () => {
    const { servico } = montar([
      { metal: 'Ouro branco', quantidade: 200, valor: 100 },
    ]);

    const r = await servico.montar({ verLoja: true }).gestaoPorMetal({});

    expect(r.linhas[0]).toBe(`Ouro branco: 200 peças — ${moeda(100)}`);
  });

  /**
   * A SEGUNDA BARREIRA. O schema so e oferecido a quem ve a loja, e aqui se
   * confere de novo: schema e pedido, nao permissao.
   */
  it('quem nao ve a loja nao recebe a resposta, e o banco nem e consultado', async () => {
    const { servico, porMetal } = montar([
      { metal: 'Ouro branco', quantidade: 1, valor: 1 },
    ]);

    const r = await servico.montar({}).gestaoPorMetal({});

    expect(r.status).toBe('INDISPONIVEL');
    expect(r.linhas).toEqual([]);
    expect(porMetal).not.toHaveBeenCalled();
  });

  /**
   * LISTA VAZIA, E NAO UM STATUS NOVO — e o mesmo desenho do
   * `faturamento_por_empresa`: quem transforma vazio em frase e o cliente do
   * modelo, num lugar so.
   */
  it('periodo sem venda devolve OK com a lista vazia', async () => {
    const { servico } = montar([]);

    const r = await servico.montar({ verLoja: true }).gestaoPorMetal({
      periodo: 'HOJE',
    });

    expect(r).toEqual({
      status: 'OK',
      linhas: [],
      periodo: 'o histórico inteiro',
      // DE QUEM E O NUMERO (17/11): quem ve a loja recebe LOJA.
      escopo: 'LOJA',
    });
  });

  it('o periodo em datas chega ao caso de uso', async () => {
    const { servico, porMetal } = montar([]);

    await servico.montar({ verLoja: true }).gestaoPorMetal({
      de: '2026-08-01',
      ate: '2026-08-31',
    });

    const [recorte, de, ate] = porMetal.mock.calls[0];
    expect(recorte).toBeUndefined();
    expect(de).toEqual(new Date(2026, 7, 1));
    expect(ate).toEqual(new Date(2026, 7, 31));
  });
});
