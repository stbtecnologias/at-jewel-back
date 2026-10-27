import { ConsultarCarteiraVendedoraUseCase } from './consultar-carteira-vendedora.use-case';

/**
 * AS COMPRAS DE CADA CLIENTE, ANO A ANO — 27/10/2026.
 *
 * ==========================================================================
 * O PEDIDO, NAS PALAVRAS DE QUEM PEDIU:
 *
 *   "Organizar por cliente, em ordem alfabética, mostrando a quantidade de
 *    peças compradas em cada ano, o valor das compras e o total dos dois
 *    anos."
 *
 * Até aqui "2025 e 2026" numa janela só devolvia a SOMA dos dois — e a soma
 * apaga a comparação que a pergunta pediu.
 * ==========================================================================
 */
function montar(linhas: unknown[] = [], total = 0) {
  const clientes = {
    comprasPorAnoDaCarteira: jest.fn().mockResolvedValue(linhas),
    contarClientesComCompraNaCarteira: jest.fn().mockResolvedValue(total),
  };
  return {
    uc: new ConsultarCarteiraVendedoraUseCase(clientes as never),
    clientes,
  };
}

const JANELA = {
  de: new Date('2025-01-01T00:00:00'),
  ate: new Date('2026-12-31T00:00:00'),
};

describe('comprasPorAno', () => {
  it('uma linha por cliente e por ano vira UMA linha por cliente', async () => {
    const { uc } = montar(
      [
        { clienteId: 'c1', nome: 'Ana', ano: 2025, pecas: 3, valor: 12000 },
        { clienteId: 'c1', nome: 'Ana', ano: 2026, pecas: 1, valor: 5000 },
        { clienteId: 'c2', nome: 'Beatriz', ano: 2026, pecas: 2, valor: 8000 },
      ],
      2,
    );

    const r = await uc.comprasPorAno('SEED-VD09', JANELA);

    expect(r.clientes).toHaveLength(2);
    expect(r.clientes[0]).toEqual({
      nome: 'Ana',
      porAno: {
        2025: { pecas: 3, valor: 12000 },
        2026: { pecas: 1, valor: 5000 },
      },
      totalPecas: 4,
      totalValor: 17000,
    });
  });

  /* ========================================================================
   * OS ANOS SAEM DA JANELA, E NÃO DOS DADOS.
   *
   * A Beatriz só comprou em 2026 — e a coluna de 2025 tem de existir mesmo
   * assim, porque "não comprou em 2025" É a informação. Se os anos viessem
   * dos dados, a tabela mudaria de colunas conforme a linha.
   * ======================================================================== */
  it('os anos vêm da janela, mesmo sem compra em um deles', async () => {
    const { uc } = montar(
      [{ clienteId: 'c2', nome: 'Beatriz', ano: 2026, pecas: 2, valor: 8000 }],
      1,
    );

    const r = await uc.comprasPorAno('SEED-VD09', JANELA);

    expect(r.anos).toEqual([2025, 2026]);
    expect(r.clientes[0].porAno[2025]).toBeUndefined();
  });

  it('a janela cobre o último dia inteiro, e a contagem olha a mesma', async () => {
    const { uc, clientes } = montar([], 0);

    await uc.comprasPorAno('SEED-VD09', JANELA);

    const daLista = clientes.comprasPorAnoDaCarteira.mock.calls[0][1];
    const daContagem = clientes.contarClientesComCompraNaCarteira.mock.calls[0][1];
    expect(daLista.ate).toEqual(new Date('2026-12-31T23:59:59.999'));
    expect(daContagem.ate).toEqual(daLista.ate);
    expect(daContagem.de).toEqual(daLista.de);
  });

  it('o teto é o da conversa, e o arquivo pede o seu', async () => {
    const { uc, clientes } = montar([], 0);

    await uc.comprasPorAno('SEED-VD09', JANELA);
    expect(clientes.comprasPorAnoDaCarteira.mock.calls[0][1].limite).toBe(20);

    await uc.comprasPorAno('SEED-VD09', { ...JANELA, limite: 500 });
    expect(clientes.comprasPorAnoDaCarteira.mock.calls[1][1].limite).toBe(500);
  });

  it('vendedora sem código no ERP não tem carteira — e não consulta', async () => {
    const { uc, clientes } = montar([], 0);

    const r = await uc.comprasPorAno(null, JANELA);

    expect(r).toEqual({ clientes: [], anos: [], total: 0 });
    expect(clientes.comprasPorAnoDaCarteira).not.toHaveBeenCalled();
  });
});
