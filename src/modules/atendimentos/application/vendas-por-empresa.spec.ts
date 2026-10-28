import { FerramentasGestaoService } from './ferramentas-gestao.service';

/**
 * AS VENDAS DE UMA EMPRESA DO GRUPO — 26/10/2026.
 *
 * ==========================================================================
 * *"Não posso simplesmente buscar as vendas de uma empresa, de forma geral."*
 *
 *   — "quais as vendas de SP?"  … "quero ver"
 *   — "As vendas uma a uma eu preciso buscar por cliente, vendedora ou número
 *      do documento — não dá para puxar só pela filial."
 *
 * Ela não estava se esquivando: empresa não existia como recorte, nem no
 * schema nem na consulta. A coluna existia desde 02/10 — é a mesma do
 * faturamento por empresa — e nenhuma consulta de venda olhava para ela.
 *
 * O QUE ESTE ARQUIVO PROTEGE SÃO DUAS COISAS, e a segunda é a que cala:
 * a empresa virar recorte, e ela NÃO valer para quem não vê a loja.
 * ==========================================================================
 */

/** Qualquer colaborador que este teste não toca. Tocar nele estoura. */
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

const SP = { id: 'emp-1', nome: 'AT JEWEL LTDA - SP' };
const MATRIZ = { id: 'emp-2', nome: 'AT JEWEL LTDA' };

const UMA_VENDA = {
  documento: '1157',
  data: new Date('2026-08-12T12:00:00Z'),
  clienteCodigo: '00376',
  cliente: 'Cliente A',
  vendedora: 'Camila',
  valor: 52500,
  status: 'concluida',
  itens: [{ quantidade: 1, nome: 'Brinco DTS', valor: 52500 }],
};

function montar(opcoes: {
  empresas: { id: string; nome: string }[];
  vendas?: typeof UMA_VENDA[];
  /** So os testes que pedem vendedora precisam resolver nome. */
  vendedora?: { id: string; nome: string };
}) {
  const detalhadas = jest
    .fn()
    .mockResolvedValue({ vendas: opcoes.vendas ?? [], total: 0 });
  const listar = jest.fn().mockResolvedValue(opcoes.empresas);
  const relatorio = { guardar: jest.fn(), guardarTexto: jest.fn() };

  const deps = Array.from({ length: 32 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  if (opcoes.vendedora) {
    deps[0] = {
      execute: jest.fn().mockResolvedValue({
        status: 'OK',
        ...opcoes.vendedora,
      }),
    } as never;
  }
  deps[1] = { detalhadas } as never;
  deps[23] = relatorio as never;
  deps[31] = { listar } as never;

  const servico = new FerramentasGestaoService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasGestaoService
    >),
  );
  return { servico, detalhadas, listar, relatorio };
}

describe('a empresa como recorte das vendas uma a uma', () => {
  it('"as vendas de SP" vira consulta — empresa sozinha basta', async () => {
    const { servico, detalhadas, listar } = montar({ empresas: [SP] });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ empresa: 'SP', periodo: 'ANO' });

    expect(r.status).toBe('OK');
    // O FILTRO SAIU DO SQL EM 28/10/2026, pelo TRACO: o modelo escreve
    // "AT JEWEL LTDA — SP" com travessao, o banco guarda hifen, e o
    // ILIKE voltava vazio. Sao oito empresas — vem todas, e o casamento
    // acontece em memoria, com a mesma normalizacao do acento e da caixa.
    expect(listar).toHaveBeenCalledWith({ ativo: true });
    expect(detalhadas.mock.calls[0][0]).toMatchObject({ empresaId: 'emp-1' });
  });

  it('o título do arquivo diz de qual filial é', async () => {
    const { servico, relatorio } = montar({
      empresas: [SP],
      vendas: [UMA_VENDA],
    });

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ empresa: 'SP', periodo: 'ANO' });

    // E DE QUANDO — 27/10/2026. Um PDF de 130 vendas de dois anos chamado
    // so "Vendas da Ylka" nao diz de que periodo e; o recorte de tempo passou
    // a entrar no titulo junto com o de quem, como manda a decisao de 21/10.
    expect(relatorio.guardar.mock.calls[0][1].titulo).toBe(
      'Vendas de AT JEWEL LTDA - SP — este ano',
    );
  });

  /* A LISTA, E NÃO UMA ESCOLHA — a mesma regra do cliente e da vendedora.
   * "AT JEWEL" casa com a matriz e com a filial, e adivinhar responderia com
   * confiança sobre a empresa errada. */
  it('nome que casa com duas pergunta qual, e não consulta', async () => {
    const { servico, detalhadas } = montar({ empresas: [MATRIZ, SP] });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ empresa: 'AT JEWEL' });

    expect(r.status).toBe('AMBIGUA');
    expect(r.sobre).toBe('empresa');
    expect(r.nomes).toEqual(['AT JEWEL LTDA', 'AT JEWEL LTDA - SP']);
    expect(detalhadas).not.toHaveBeenCalled();
  });

  /**
   * ========================================================================
   * MAS O NOME INTEIRO NÃO É PALPITE — 28/10/2026.
   *
   * A busca é por pedaço, e "AT JEWEL LTDA" é começo de "AT JEWEL LTDA -
   * SP": as duas voltavam da consulta e a resposta era sempre a mesma
   * pergunta. Resultado medido no banco em 27/10: a MATRIZ, com **1.110
   * vendas desde 2023**, era inalcançável por qualquer frase. A gestora só
   * conseguia a filial de SP, que tem duas.
   *
   * Por mais exato que ela escrevesse, voltava a lista — um beco. E a regra
   * já existia para vendedora desde sempre; só não tinha chegado aqui.
   * ========================================================================
   */
  it('o nome INTEIRO resolve, apesar de a filial conter o nome da matriz', async () => {
    const { servico, detalhadas } = montar({ empresas: [MATRIZ, SP] });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ empresa: 'AT JEWEL LTDA' });

    expect(r.status).toBe('OK');
    expect(detalhadas.mock.calls[0][0]).toMatchObject({
      empresaId: 'emp-2',
    });
  });

  it('e a filial segue alcançável pelo nome dela', async () => {
    const { servico, detalhadas } = montar({ empresas: [MATRIZ, SP] });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ empresa: 'AT JEWEL LTDA - SP' });

    expect(r.status).toBe('OK');
    expect(detalhadas.mock.calls[0][0]).toMatchObject({ empresaId: 'emp-1' });
  });

  it('empresa que não existe responde "não achei", e não lista nada', async () => {
    const { servico, detalhadas } = montar({ empresas: [] });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ empresa: 'Bahia' });

    expect(r.status).toBe('NAO_ENCONTRADA');
    expect(r.sobre).toBe('empresa');
    expect(detalhadas).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // O PORTÃO, QUE É A METADE QUE CALA.
  //
  // Sem `analytics:read` o parâmetro `empresa` nem é declarado ao modelo — mas
  // schema é PEDIDO, e a barreira de verdade é esta. Duas barreiras para o
  // mesmo erro, como no `itens_mais_vendidos`: entregar as vendas de uma
  // filial inteira a quem não pode vê-las não levanta exceção nenhuma.
  // ==========================================================================
  it('sem ver a loja, a empresa é ignorada — e sozinha não é recorte', async () => {
    const { servico, detalhadas, listar } = montar({ empresas: [SP] });

    const r = await servico
      .montar({ verLoja: false })
      .gestaoVendasDetalhadas({ empresa: 'SP', periodo: 'ANO' });

    expect(r.status).toBe('EXIGE_RECORTE');
    expect(listar).not.toHaveBeenCalled();
    expect(detalhadas).not.toHaveBeenCalled();
  });

  /* E COM OUTRO RECORTE A CONSULTA ACONTECE, mas sem a filial: a resposta é
   * sobre a vendedora, e não sobre a empresa que ela tentou pedir. */
  it('sem ver a loja, "as vendas da Camila em SP" não leva a empresa', async () => {
    const { servico, detalhadas, listar } = montar({
      empresas: [SP],
      vendedora: { id: 'vd-1', nome: 'Camila' },
    });

    const r = await servico
      .montar({ verLoja: false })
      .gestaoVendasDetalhadas({ vendedora: 'camila', empresa: 'SP' });

    expect(r.status).toBe('OK');
    expect(listar).not.toHaveBeenCalled();
    expect(detalhadas.mock.calls[0][0]).toMatchObject({
      vendedoraId: 'vd-1',
      empresaId: null,
    });
  });

  it('a bandeira do schema espelha quem vê a loja', () => {
    const { servico } = montar({ empresas: [] });

    expect(
      servico.montar({ verLoja: true }).gestaoVendasPorEmpresaDisponivel,
    ).toBe(true);
    expect(
      servico.montar({ verLoja: false }).gestaoVendasPorEmpresaDisponivel,
    ).toBe(false);
  });
});
