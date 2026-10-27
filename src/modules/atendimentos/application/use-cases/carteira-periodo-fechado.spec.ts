import { ConsultarCarteiraVendedoraUseCase } from './consultar-carteira-vendedora.use-case';

/**
 * O PERÍODO FECHADO NA CARTEIRA — 27/10/2026.
 *
 * ==========================================================================
 * *"As compras dos clientes da Ylka em 2025 e 2026."*
 *
 * Só havia `ultimosMeses`, que conta de hoje para trás — e com ele não se
 * pergunta "2025". Ano fechado precisa das duas pontas.
 * ==========================================================================
 */
function montar() {
  const clientes = {
    maioresCompradoresDaCarteira: jest.fn().mockResolvedValue([]),
    contarCompradoresDaCarteira: jest.fn().mockResolvedValue(0),
  };
  return {
    uc: new ConsultarCarteiraVendedoraUseCase(clientes as never),
    clientes,
  };
}

describe('maioresCompradores com as duas pontas', () => {
  /* ========================================================================
   * O ÚLTIMO DIA INTEIRO, E NÃO A MEIA-NOITE DELE.
   *
   * A data chega 00:00. Sem esticar até 23:59:59.999, uma compra feita no
   * dia 31 de dezembro às 15h ficaria de fora de "2025" — e ninguém
   * desconfiaria, porque a lista viria com cara de completa.
   * ======================================================================== */
  it('o fim da janela cobre o último dia inteiro', async () => {
    const { uc, clientes } = montar();

    await uc.maioresCompradores('SEED-VD09', {
      de: new Date('2025-01-01T00:00:00'),
      ate: new Date('2025-12-31T00:00:00'),
    });

    const opcoes = clientes.maioresCompradoresDaCarteira.mock.calls[0][1];
    expect(opcoes.desde).toEqual(new Date('2025-01-01T00:00:00'));
    expect(opcoes.ate).toEqual(new Date('2025-12-31T23:59:59.999'));
  });

  it('a contagem olha a MESMA janela da lista', async () => {
    const { uc, clientes } = montar();

    await uc.maioresCompradores('SEED-VD09', {
      de: new Date('2025-01-01T00:00:00'),
      ate: new Date('2025-12-31T00:00:00'),
    });

    const daLista = clientes.maioresCompradoresDaCarteira.mock.calls[0][1];
    const daContagem = clientes.contarCompradoresDaCarteira.mock.calls[0][1];
    expect(daContagem.desde).toEqual(daLista.desde);
    expect(daContagem.ate).toEqual(daLista.ate);
  });

  /* `ate` SOZINHO NÃO VALE: sem `de` a janela seria "tudo até dezembro", que
   * ninguém pediu — e o modelo manda os dois juntos ou nenhum. */
  it('sem o começo, o fim é ignorado', async () => {
    const { uc, clientes } = montar();

    await uc.maioresCompradores('SEED-VD09', {
      ate: new Date('2025-12-31T00:00:00'),
    });

    expect(clientes.maioresCompradoresDaCarteira.mock.calls[0][1].ate).toBeUndefined();
  });

  it('sem período, nada muda — e o teto continua sendo vinte', async () => {
    const { uc, clientes } = montar();

    await uc.maioresCompradores('SEED-VD09', {});

    const opcoes = clientes.maioresCompradoresDaCarteira.mock.calls[0][1];
    expect(opcoes.desde).toBeUndefined();
    expect(opcoes.ate).toBeUndefined();
    expect(opcoes.limite).toBe(20);
  });

  it('o arquivo pede mais que a conversa', async () => {
    const { uc, clientes } = montar();

    await uc.maioresCompradores('SEED-VD09', { limite: 500 });

    expect(clientes.maioresCompradoresDaCarteira.mock.calls[0][1].limite).toBe(
      500,
    );
  });
});
