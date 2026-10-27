import { FerramentasGestaoService } from './ferramentas-gestao.service';

/**
 * O ARQUIVO LEVA A LISTA INTEIRA — 27/10/2026.
 *
 * ==========================================================================
 * *"As 10 vendas mais recentes da Ylka em 2026 (de 43 no total)"* — e o PDF
 * dessa resposta saía com as mesmas dez. A conversa mostra dez porque
 * mensagem de WhatsApp não comporta mais; o ARQUIVO existe justamente para
 * levar o que não cabe ali.
 *
 * O caso que trouxe isto terminou com o cliente pedindo a mesma lista ao
 * ChatGPT, colando nomes de cliente e valores lá — porque o nosso PDF não
 * respondia. Em 23/10 a mesma correção foi feita na lista de PEÇAS; estas
 * são as duas que faltavam para o pedido dele.
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

/** Uma venda qualquer, com a peça embaixo. */
function venda(n: number) {
  return {
    documento: String(1000 + n),
    data: new Date('2026-08-12T12:00:00Z'),
    clienteCodigo: String(n).padStart(5, '0'),
    cliente: `Cliente ${n}`,
    vendedora: 'Ylka',
    valor: 1000 + n,
    status: 'concluida',
    itens: [{ quantidade: 1, nome: 'Brinco', valor: 1000 + n }],
  };
}

function comprador(n: number) {
  return {
    id: `cli-${n}`,
    nome: `Cliente ${n}`,
    quantidade: n,
    valorTotal: 1000 * n,
    ultimaCompra: new Date('2025-12-20T12:00:00Z'),
    // A mesma linha serve as quatro listas: fidelidade le outros campos,
    // e epoca le os anos. Um duble so, para o teste nao virar quatro.
    anos: 2,
    nivel: 'Ouro' as const,
    compras: n,
    valorLiquido: 1000 * n,
    vendedoraNome: 'Ylka',
  };
}

function montar(opcoes: { vendas?: number; total?: number; clientes?: number }) {
  const quantas = opcoes.vendas ?? 0;
  const detalhadas = jest.fn().mockResolvedValue({
    vendas: Array.from({ length: quantas }, (_, i) => venda(i + 1)),
    total: opcoes.total ?? quantas,
  });
  const lista = Array.from({ length: opcoes.clientes ?? 0 }, (_, i) =>
    comprador(i + 1),
  );
  const pagina = {
    clientes: lista,
    total: opcoes.total ?? lista.length,
    deslocamento: 0,
    semVendedora: 0,
  };
  const maioresCompradores = jest.fn().mockResolvedValue(pagina);
  const semComprar = jest.fn().mockResolvedValue(pagina);
  const porEpoca = jest.fn().mockResolvedValue(pagina);
  const porEpocaDaLoja = jest.fn().mockResolvedValue(pagina);
  const porFidelidade = jest.fn().mockResolvedValue(pagina);
  const relatorio = { guardar: jest.fn(), guardarTexto: jest.fn() };

  const deps = Array.from({ length: 32 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  deps[0] = {
    execute: jest.fn().mockResolvedValue({
      status: 'OK',
      id: 'vd-1',
      nome: 'Ylka',
      codigoErp: 'SEED-VD09',
    }),
  } as never;
  deps[1] = { detalhadas } as never;
  deps[13] = {
    maioresCompradores,
    semComprar,
    porEpoca,
    porEpocaDaLoja,
    porFidelidade,
  } as never;
  deps[23] = relatorio as never;

  const servico = new FerramentasGestaoService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasGestaoService
    >),
  );
  return {
    servico,
    detalhadas,
    maioresCompradores,
    semComprar,
    porEpoca,
    porEpocaDaLoja,
    porFidelidade,
    relatorio,
  };
}

describe('as vendas uma a uma', () => {
  it('a conversa recebe dez, e o arquivo recebe as 43', async () => {
    const { servico, detalhadas, relatorio } = montar({
      vendas: 43,
      total: 43,
    });

    const r = await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ vendedora: 'ylka', periodo: 'ANO' });

    expect(r.linhas).toHaveLength(10);
    expect(r.total).toBe(43);
    expect(relatorio.guardar.mock.calls[0][1].linhas).toHaveLength(43);
  });

  /* UMA CONSULTA SO: o `total` vem do `count(*) OVER ()` e não depende do
   * limite, então pedir 500 e cortar dez em memória custa uma ida ao banco. */
  it('pede o teto do arquivo ao banco, e não o da conversa', async () => {
    const { servico, detalhadas } = montar({ vendas: 12, total: 12 });

    await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ vendedora: 'ylka' });

    expect(detalhadas.mock.calls[0][1]).toBe(500);
  });

  it('acima do teto, o documento diz o corte', async () => {
    const { servico, relatorio } = montar({ vendas: 500, total: 743 });

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ vendedora: 'ylka' });

    expect(relatorio.guardar.mock.calls[0][1].exibindo).toEqual({
      mostradas: 500,
      total: 743,
    });
  });
});

describe('os melhores clientes da vendedora', () => {
  /* ========================================================================
   * O ANO FECHADO — e era isto que faltava para "em 2025 e 2026".
   *
   * `ultimosMeses` conta de hoje para trás: com ele não se pergunta 2025.
   * ======================================================================== */
  it('"em 2025" chega como as duas pontas, e não como meses', async () => {
    const { servico, maioresCompradores } = montar({ clientes: 3 });

    await servico.montar({ verLoja: true }).gestaoMelhores({
      vendedora: 'ylka',
      de: '2025-01-01',
      ate: '2025-12-31',
      ultimosMeses: 12,
    });

    const opcoes = maioresCompradores.mock.calls[0][1];
    expect(opcoes.de).toEqual(new Date('2025-01-01T00:00:00'));
    expect(opcoes.ate).toEqual(new Date('2025-12-31T00:00:00'));
    // AS DUAS PONTAS GANHAM: misturar com "últimos 12 meses" daria uma
    // janela que ninguém pediu.
    expect(opcoes.ultimosMeses).toBeUndefined();
  });

  it('sem as duas pontas, "últimos meses" continua valendo', async () => {
    const { servico, maioresCompradores } = montar({ clientes: 2 });

    await servico
      .montar({ verLoja: true })
      .gestaoMelhores({ vendedora: 'ylka', ultimosMeses: 6 });

    expect(maioresCompradores.mock.calls[0][1].ultimosMeses).toBe(6);
    expect(maioresCompradores.mock.calls[0][1].de).toBeUndefined();
  });

  it('a conversa fica com vinte, e o arquivo leva os 64', async () => {
    const { servico, relatorio } = montar({ clientes: 64 });

    const r = await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoMelhores({ vendedora: 'ylka' });

    expect(r.linhas).toHaveLength(20);
    expect(relatorio.guardar.mock.calls[0][1].linhas).toHaveLength(64);
  });

  it('o título do arquivo diz de quem e de quando', async () => {
    const { servico, relatorio } = montar({ clientes: 2 });

    await servico.montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoMelhores({
        vendedora: 'ylka',
        de: '2025-01-01',
        ate: '2025-12-31',
      });

    expect(relatorio.guardar.mock.calls[0][1].titulo).toBe(
      'Melhores clientes — Ylka · 2025',
    );
  });

  it('com categoria, a coluna deixa de contar compras e passa a contar peças', async () => {
    const { servico, relatorio } = montar({ clientes: 2 });

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoMelhores({ vendedora: 'ylka', categoria: 'Anel' });

    expect(relatorio.guardar.mock.calls[0][1].colunas[1].titulo).toBe('Peças');
  });
});

describe('as outras tres listas da carteira', () => {
  /* A VARREDURA DE 27/10: em 23/10 so a lista de PECAS passou a mandar
   * tudo no arquivo. Estas sao as que ficaram. */
  it('clientes sem comprar: a conversa tem a pagina, o arquivo tem tudo', async () => {
    const { servico, semComprar, relatorio } = montar({ clientes: 37 });

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoCarteira({ vendedora: 'ylka', meses: 6 });

    // Duas consultas: a da pagina e a do arquivo, do principio ate o teto.
    expect(semComprar).toHaveBeenCalledTimes(2);
    expect(semComprar.mock.calls[1][2]).toBe(0);
    expect(semComprar.mock.calls[1][3]).toBe(500);
    expect(relatorio.guardar.mock.calls[0][1].linhas).toHaveLength(37);
  });

  it('clientes por epoca: a consulta pede o teto do arquivo', async () => {
    const { servico, porEpoca, relatorio } = montar({ clientes: 45 });

    const r = await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoEpoca({ vendedora: 'ylka', mes: 12 });

    expect(porEpoca.mock.calls[0][2]).toBe(500);
    expect(r.linhas).toHaveLength(20);
    expect(relatorio.guardar.mock.calls[0][1].linhas).toHaveLength(45);
  });

  it('fidelidade: duas consultas, e o arquivo com a lista inteira', async () => {
    const { servico, porFidelidade, relatorio } = montar({ clientes: 31 });

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoFidelidade({});

    expect(porFidelidade).toHaveBeenCalledTimes(2);
    expect(porFidelidade.mock.calls[1][0].limite).toBe(500);
    expect(relatorio.guardar.mock.calls[0][1].linhas).toHaveLength(31);
  });
});
