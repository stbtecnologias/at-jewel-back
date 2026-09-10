import { RegistrarContatoWhatsappUseCase } from './registrar-contato-whatsapp.use-case';

/**
 * O CONTATO NO NUMERO DA VENDEDORA VIRA INTERACAO — E SO ISSO.
 *
 * Tres regras aqui não são detalhe:
 *
 *   1. numero desconhecido NAO vira cliente. O numero da vendedora recebe de
 *      tudo — familia, fornecedor, grupo de bairro — e cadastrar cada um
 *      sujaria a base que alimenta carteira, metas e analytics;
 *   2. rajada de mensagens e UM contato, não oito pontos iguais na regua;
 *   3. o atendimento aberto manda, mesmo sendo de outra vendedora. Reatribuir
 *      por causa de uma mensagem tiraria a cliente da carteira de quem esta
 *      negociando com ela, sem ninguem decidir isso.
 */
describe('RegistrarContatoWhatsappUseCase', () => {
  const AGORA = new Date(2026, 8, 8, 14, 30);

  let repo: {
    buscarAbertoPorCliente: jest.Mock;
    abrir: jest.Mock;
    ultimaInteracao: jest.Mock;
    criarInteracao: jest.Mock;
  };
  let buscarCliente: { execute: jest.Mock };
  let conversas: { registrarMensagem: jest.Mock };
  let uc: RegistrarContatoWhatsappUseCase;

  const ENTRADA = {
    vendedoraId: 'vd-marina',
    telefone: '5585988887777',
    daVendedora: false,
    em: AGORA,
  };

  beforeEach(() => {
    repo = {
      buscarAbertoPorCliente: jest.fn().mockResolvedValue(null),
      abrir: jest.fn().mockResolvedValue({ id: 'at-novo' }),
      ultimaInteracao: jest.fn().mockResolvedValue(null),
      criarInteracao: jest.fn().mockResolvedValue({ id: 'i-1' }),
    };
    buscarCliente = { execute: jest.fn().mockResolvedValue({ id: 'cli-1' }) };
    conversas = { registrarMensagem: jest.fn().mockResolvedValue(undefined) };
    uc = new RegistrarContatoWhatsappUseCase(
      repo as never,
      conversas as never,
      buscarCliente as never,
    );
  });

  it('a cliente escrevendo vira CONTATO_CLIENTE no atendimento aberto', async () => {
    repo.buscarAbertoPorCliente.mockResolvedValue({ id: 'at-7' });

    const r = await uc.execute(ENTRADA);

    expect(r).toEqual({
      registrado: true,
      atendimentoId: 'at-7',
      tipo: 'CONTATO_CLIENTE',
    });
    expect(repo.criarInteracao).toHaveBeenCalledWith({
      atendimentoId: 'at-7',
      tipo: 'CONTATO_CLIENTE',
      ocorridoEm: AGORA,
      status: 'CONCLUIDA',
    });
    expect(repo.abrir).not.toHaveBeenCalled();
  });

  /** Sem os dois tipos, "escreveu e ninguem respondeu" some da regua. */
  it('a vendedora escrevendo vira RESPOSTA_VENDEDORA', async () => {
    repo.buscarAbertoPorCliente.mockResolvedValue({ id: 'at-7' });

    const r = await uc.execute({ ...ENTRADA, daVendedora: true });

    expect(r).toMatchObject({ tipo: 'RESPOSTA_VENDEDORA' });
  });

  it('sem atendimento aberto, abre um com a dona do numero', async () => {
    const r = await uc.execute(ENTRADA);

    expect(repo.abrir).toHaveBeenCalledWith({
      clienteId: 'cli-1',
      vendedoraId: 'vd-marina',
    });
    expect(r).toMatchObject({ atendimentoId: 'at-novo' });
  });

  describe('numero desconhecido', () => {
    it('nao grava nada e nao cria cliente', async () => {
      buscarCliente.execute.mockResolvedValue(null);

      const r = await uc.execute(ENTRADA);

      expect(r).toEqual({ registrado: false, motivo: 'cliente_desconhecido' });
      expect(repo.abrir).not.toHaveBeenCalled();
      expect(repo.criarInteracao).not.toHaveBeenCalled();
    });

    it('cliente sem id tambem nao passa', async () => {
      buscarCliente.execute.mockResolvedValue({ id: undefined });

      const r = await uc.execute(ENTRADA);

      expect(r).toEqual({ registrado: false, motivo: 'cliente_desconhecido' });
    });
  });

  describe('a janela do mesmo contato', () => {
    beforeEach(() => repo.buscarAbertoPorCliente.mockResolvedValue({ id: 'at-7' }));

    it('oito mensagens em cinco minutos sao UM ponto', async () => {
      repo.ultimaInteracao.mockResolvedValue({
        ocorridoEm: new Date(AGORA.getTime() - 5 * 60_000),
      });

      const r = await uc.execute(ENTRADA);

      expect(r).toEqual({ registrado: false, motivo: 'repetido_na_janela' });
      expect(repo.criarInteracao).not.toHaveBeenCalled();
    });

    it('voltar a falar depois de 20 minutos e um contato novo', async () => {
      repo.ultimaInteracao.mockResolvedValue({
        ocorridoEm: new Date(AGORA.getTime() - 20 * 60_000),
      });

      const r = await uc.execute(ENTRADA);

      expect(r).toMatchObject({ registrado: true });
    });

    /** A janela e por TIPO: ela responder logo depois nao pode ser engolida
     *  pelo contato da cliente — e o par pergunta/resposta que interessa. */
    it('a janela nao mistura os dois sentidos', async () => {
      await uc.execute(ENTRADA);
      expect(repo.ultimaInteracao).toHaveBeenCalledWith('at-7', 'CONTATO_CLIENTE');

      await uc.execute({ ...ENTRADA, daVendedora: true });
      expect(repo.ultimaInteracao).toHaveBeenCalledWith('at-7', 'RESPOSTA_VENDEDORA');
    });

    it('interacao anterior sem hora nao bloqueia', async () => {
      repo.ultimaInteracao.mockResolvedValue({ ocorridoEm: null });

      const r = await uc.execute(ENTRADA);

      expect(r).toMatchObject({ registrado: true });
    });
  });

  /**
   * A cliente ja e atendida pela Bianca e escreve para a Marina. O ponto entra
   * no episodio da Bianca — que e a verdade do que aconteceu.
   */
  it('nao reatribui o atendimento aberto de outra vendedora', async () => {
    repo.buscarAbertoPorCliente.mockResolvedValue({
      id: 'at-da-bianca',
      vendedoraId: 'vd-bianca',
    });

    const r = await uc.execute(ENTRADA);

    expect(r).toMatchObject({ atendimentoId: 'at-da-bianca' });
    expect(repo.abrir).not.toHaveBeenCalled();
    expect(repo.criarInteracao).toHaveBeenCalledWith(
      expect.objectContaining({ atendimentoId: 'at-da-bianca' }),
    );
  });
});
