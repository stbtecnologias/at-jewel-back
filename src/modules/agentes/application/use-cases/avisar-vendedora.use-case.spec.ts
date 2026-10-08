import { AvisarVendedoraUseCase } from './avisar-vendedora.use-case';

/**
 * ==========================================================================
 * ESTE ARQUIVO NASCEU DE UMA DÍVIDA, e vale dizer qual — 08/10/2026.
 *
 * O RF16 mudou este use case (o envio passou a cair no CORPORATIVO quando o
 * pessoal não existe) e ele **não tinha spec nenhum**. A mudança ficou
 * coberta apenas pela função compartilhada e pelo `tsc`: reverter só aqui
 * passaria calado.
 *
 * O que se guarda abaixo não é a feliz — é a ORDEM das coisas depois que o
 * WhatsApp já saiu, que é onde um erro fica caro: a Anastasia dizendo que
 * falhou algo que a vendedora já leu.
 * ==========================================================================
 */
describe('AvisarVendedoraUseCase', () => {
  const CLIENTE = { id: 'cl-1', nome: 'Carla Oliveira', vendedoraCodigoErp: '007' };
  const VENDEDORA = {
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    whatsappInterno: null,
    whatsappExterno: '5585911112222',
  };

  function montar(over: Partial<Record<string, unknown>> = {}) {
    const clientes = {
      buscarPorNomeParcial: jest.fn().mockResolvedValue([CLIENTE]),
    };
    const vendedoras = {
      buscarPorCodigoErp: jest.fn().mockResolvedValue(VENDEDORA),
    };
    const whatsapp = {
      resolverChatId: jest.fn().mockResolvedValue('558591111222@c.us'),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
    };
    const atendimentos = {
      buscarAbertoPorCliente: jest.fn().mockResolvedValue(null),
      abrir: jest.fn().mockResolvedValue({ id: 'at-1' }),
      criarInteracao: jest.fn().mockResolvedValue(undefined),
      ultimaInteracao: jest.fn().mockResolvedValue(null),
      reagendar: jest.fn().mockResolvedValue(undefined),
      completarOcasiaoSeVazia: jest.fn().mockResolvedValue(undefined),
    };
    const eventos = { execute: jest.fn().mockResolvedValue(undefined) };

    const alvos = { clientes, vendedoras, whatsapp, atendimentos, eventos };
    Object.assign(alvos, over);

    const useCase = new AvisarVendedoraUseCase(
      alvos.clientes as never,
      alvos.vendedoras as never,
      alvos.whatsapp as never,
      alvos.atendimentos as never,
      alvos.eventos as never,
    );
    return { useCase, ...alvos };
  }

  const pedido = { cliente: 'Carla', assunto: 'quer ver anéis de esmeralda' };

  /**
   * RF16, 08/10/2026. Medido na base: das 7 vendedoras ativas, **7 têm o
   * corporativo e só 1 tem o pessoal**. Antes desta mudança o aviso parava
   * aqui com `VENDEDORA_SEM_WHATSAPP` para quem tem telefone de trabalho
   * cadastrado — seis das sete.
   */
  /* ESTE É O TESTE. O resto é contorno. */
  it('só com o corporativo, o aviso sai — e sai por ele', async () => {
    const { useCase, whatsapp } = montar();

    const r = await useCase.execute(pedido);

    expect(r.status).toBe('ENVIADO');
    expect(whatsapp.resolverChatId).toHaveBeenCalledWith('5585911112222');
    // PELO NÚMERO DA ELENA: quem recebe é vendedora, e a resposta dela tem
    // de cair no canal dela. Saindo pela Anastasia, o "ok, já falo com ela"
    // voltaria como "me chama no outro número".
    expect(whatsapp.enviarTexto).toHaveBeenCalledWith(
      '558591111222@c.us',
      expect.any(String),
      'ELENA',
    );
  });

  it('com os dois cadastrados, o corporativo ganha', async () => {
    const { useCase, whatsapp } = montar({
      vendedoras: {
        buscarPorCodigoErp: jest.fn().mockResolvedValue({
          ...VENDEDORA,
          whatsappInterno: '5585988887777',
        }),
      },
    });

    await useCase.execute(pedido);

    expect(whatsapp.resolverChatId).toHaveBeenCalledWith('5585911112222');
  });

  it('sem nenhum dos dois, não envia e diz o nome dela', async () => {
    const { useCase, whatsapp } = montar({
      vendedoras: {
        buscarPorCodigoErp: jest.fn().mockResolvedValue({
          ...VENDEDORA,
          whatsappInterno: null,
          whatsappExterno: null,
        }),
      },
    });

    const r = await useCase.execute(pedido);

    expect(r).toEqual({
      status: 'VENDEDORA_SEM_WHATSAPP',
      vendedoraNome: 'Marina Albuquerque',
    });
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  /**
   * ========================================================================
   * DAQUI PARA BAIXO O WHATSAPP JÁ FOI — e é a invariante mais importante
   * deste arquivo.
   *
   * Registrar o atendimento e o evento acontece DEPOIS do envio. Se um deles
   * lançar e a exceção subir, a Anastasia diria "não consegui avisar" sobre
   * uma mensagem que a vendedora já leu — e a gestão avisaria de novo.
   * ========================================================================
   */
  describe('depois que a mensagem saiu, nada derruba o ENVIADO', () => {
    it('falha ao registrar o atendimento não desfaz o aviso', async () => {
      const { useCase, whatsapp } = montar({
        atendimentos: {
          buscarAbertoPorCliente: jest.fn().mockResolvedValue(null),
          abrir: jest.fn().mockRejectedValue(new Error('deadlock')),
          criarInteracao: jest.fn(),
          ultimaInteracao: jest.fn().mockResolvedValue(null),
          reagendar: jest.fn(),
          completarOcasiaoSeVazia: jest.fn(),
        },
      });

      const r = await useCase.execute(pedido);

      expect(r.status).toBe('ENVIADO');
      expect(whatsapp.enviarTexto).toHaveBeenCalled();
    });

    it('falha ao registrar o evento também não', async () => {
      const { useCase } = montar({
        eventos: { execute: jest.fn().mockRejectedValue(new Error('fora')) },
      });

      const r = await useCase.execute(pedido);

      expect(r.status).toBe('ENVIADO');
    });
  });

  describe('o que impede o envio, e por quê', () => {
    it('termo curto demais nem consulta o banco', async () => {
      const { useCase, clientes } = montar();

      const r = await useCase.execute({ ...pedido, cliente: 'Ca' });

      expect(r).toEqual({ status: 'CLIENTE_NAO_ENCONTRADO', termo: 'Ca' });
      expect(clientes.buscarPorNomeParcial).not.toHaveBeenCalled();
    });

    /** Homônimo não é palpite: a gestão desempata, não o código. */
    it('mais de um cliente vira pergunta, com a quantidade', async () => {
      const { useCase, whatsapp } = montar({
        clientes: {
          buscarPorNomeParcial: jest
            .fn()
            .mockResolvedValue([CLIENTE, { ...CLIENTE, id: 'cl-2' }]),
        },
      });

      const r = await useCase.execute(pedido);

      expect(r).toEqual({
        status: 'CLIENTE_AMBIGUO',
        termo: 'Carla',
        quantidade: 2,
      });
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });

    it('cliente sem dona na carteira não gera aviso', async () => {
      const { useCase, whatsapp } = montar({
        clientes: {
          buscarPorNomeParcial: jest
            .fn()
            .mockResolvedValue([{ ...CLIENTE, vendedoraCodigoErp: null }]),
        },
      });

      const r = await useCase.execute(pedido);

      expect(r.status).toBe('SEM_VENDEDORA');
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });

    it('número cadastrado sem conta de WhatsApp é dito, e não enviado', async () => {
      const { useCase, whatsapp } = montar({
        whatsapp: {
          resolverChatId: jest.fn().mockResolvedValue(null),
          enviarTexto: jest.fn(),
        },
      });

      const r = await useCase.execute(pedido);

      expect(r.status).toBe('NUMERO_SEM_WHATSAPP');
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });

    it('falha do WhatsApp vira FALHA_ENVIO, e o atendimento NÃO é registrado', async () => {
      const { useCase, atendimentos } = montar({
        whatsapp: {
          resolverChatId: jest.fn().mockResolvedValue('x@c.us'),
          enviarTexto: jest.fn().mockRejectedValue(new Error('waha fora')),
        },
      });

      const r = await useCase.execute(pedido);

      expect(r.status).toBe('FALHA_ENVIO');
      // Registrar um aviso que não saiu deixaria a vendedora cobrada por um
      // contato que ela nunca viu.
      expect(atendimentos.abrir).not.toHaveBeenCalled();
    });
  });

  /**
   * COMPLEMENTO, NÃO SEGUNDO AVISO — defeito visto em 19/08/2026. Quem
   * escreve no painel manda o pedido em linhas: "avisa a vendedora da Carla"
   * e, logo depois, "e a ocasião é noivado, às 15h30". A segunda linha é
   * detalhe da primeira; reenviar faria a vendedora receber duas vezes.
   */
  it('pedido repetido logo depois complementa, e não manda de novo', async () => {
    const { useCase, whatsapp } = montar({
      atendimentos: {
        buscarAbertoPorCliente: jest.fn().mockResolvedValue({
          id: 'at-1',
          vendedoraId: 'vd-1',
        }),
        ultimaInteracao: jest.fn().mockResolvedValue({
          tipo: 'ENCAMINHADO',
          ocorridoEm: new Date(),
        }),
        abrir: jest.fn(),
        criarInteracao: jest.fn().mockResolvedValue(undefined),
        reagendar: jest.fn().mockResolvedValue(undefined),
        completarOcasiaoSeVazia: jest.fn().mockResolvedValue(undefined),
      },
    });

    const r = await useCase.execute(pedido);

    expect(r.status).toBe('COMPLEMENTADO');
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });
});
