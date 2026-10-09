import { DispararPendenciasUseCase } from './disparar-pendencias.use-case';

/**
 * ==========================================================================
 * ESTE ARQUIVO NASCEU DE UMA DÍVIDA — 08/10/2026.
 *
 * O RF16 mudou este use case (o envio passou a cair no CORPORATIVO quando o
 * pessoal não existe) e ele **não tinha spec nenhum**. Pior que no
 * `avisar-vendedora`: aqui quem chama é um SCHEDULER, então um defeito não
 * aparece na conversa de ninguém — ele aparece como "a vendedora nunca foi
 * cobrada", semanas depois.
 *
 * O que se guarda abaixo são as três decisões que o código toma sozinho: a
 * fila não para por uma linha ruim, o atraso tem teto, e o status depois do
 * envio depende do TIPO da pendência.
 * ==========================================================================
 */
describe('DispararPendenciasUseCase', () => {
  const AGORA = new Date('2026-10-08T14:00:00-03:00');
  const CINCO_MIN_ATRAS = new Date('2026-10-08T13:55:00-03:00');
  const DEZ_HORAS_ATRAS = new Date('2026-10-08T04:00:00-03:00');

  const CLIENTE = { id: 'cl-1', nome: 'Carla Oliveira' };
  const VENDEDORA = {
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    whatsappInterno: null,
    whatsappExterno: '5585911112222',
  };

  const pendencia = (over: Record<string, unknown> = {}) => ({
    id: 'in-1',
    atendimentoId: 'at-1',
    tipo: 'COBRANCA',
    notificarEm: CINCO_MIN_ATRAS,
    combinadoEm: CINCO_MIN_ATRAS,
    ...over,
  });

  function montar(over: Record<string, unknown> = {}) {
    const atendimentos = {
      listarVencidas: jest.fn().mockResolvedValue([pendencia()]),
      buscarPorId: jest.fn().mockResolvedValue({
        id: 'at-1',
        clienteId: 'cl-1',
        vendedoraId: 'vd-1',
        fechadoEm: null,
      }),
      atualizarStatusInteracao: jest.fn().mockResolvedValue(undefined),
    };
    const clientes = { buscarPorId: jest.fn().mockResolvedValue(CLIENTE) };
    const vendedoras = { buscarPorId: jest.fn().mockResolvedValue(VENDEDORA) };
    const whatsapp = {
      resolverChatId: jest.fn().mockResolvedValue('558591111222@c.us'),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
    };

    const alvos = { atendimentos, clientes, vendedoras, whatsapp };
    Object.assign(alvos, over);

    const useCase = new DispararPendenciasUseCase(
      alvos.atendimentos as never,
      alvos.clientes as never,
      alvos.vendedoras as never,
      alvos.whatsapp as never,
    );
    return { useCase, ...alvos };
  }

  /**
   * RF16, 08/10/2026. Medido: das 7 vendedoras ativas, **7 têm o corporativo
   * e só 1 tem o pessoal**. Antes disto a cobrança era ADIADA para seis das
   * sete — e "adiada" aqui significa que ela volta a cada rodada e expira
   * sozinha em 6h, sem ninguém perceber.
   */
  /* ESTE É O TESTE. O resto é contorno. */
  it('só com o corporativo, a cobrança sai — e sai por ele', async () => {
    const { useCase, whatsapp } = montar();

    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviadas: 1, expiradas: 0 });
    expect(whatsapp.resolverChatId).toHaveBeenCalledWith('5585911112222');
    // Número da Elena: a pendência é da VENDEDORA.
    expect(whatsapp.enviarTexto).toHaveBeenCalledWith(
      '558591111222@c.us',
      expect.any(String),
      'ELENA',
    );
  });

  it('com os dois cadastrados, o corporativo ganha', async () => {
    const { useCase, whatsapp } = montar({
      vendedoras: {
        buscarPorId: jest
          .fn()
          .mockResolvedValue({ ...VENDEDORA, whatsappInterno: '5585988887777' }),
      },
    });

    await useCase.execute(AGORA);

    expect(whatsapp.resolverChatId).toHaveBeenCalledWith('5585911112222');
  });

  it('sem nenhum dos dois, ADIA — e não expira nem envia', async () => {
    const { useCase, whatsapp, atendimentos } = montar({
      vendedoras: {
        buscarPorId: jest.fn().mockResolvedValue({
          ...VENDEDORA,
          whatsappInterno: null,
          whatsappExterno: null,
        }),
      },
    });

    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviadas: 0, expiradas: 0 });
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    expect(atendimentos.atualizarStatusInteracao).not.toHaveBeenCalled();
  });

  /**
   * O STATUS DEPOIS DO ENVIO DEPENDE DO TIPO, e é o que faz a resposta da
   * vendedora ser reconhecida: a COBRANÇA fica `AGUARDANDO_RESPOSTA`, porque
   * é por esse status que o relato dela é casado. O lembrete não espera
   * resposta.
   */
  describe('o status que fica depois do envio', () => {
    it('cobrança fica AGUARDANDO_RESPOSTA', async () => {
      const { useCase, atendimentos } = montar();

      await useCase.execute(AGORA);

      expect(atendimentos.atualizarStatusInteracao).toHaveBeenCalledWith(
        'in-1',
        'AGUARDANDO_RESPOSTA',
        AGORA,
      );
    });

    it('lembrete fica ENVIADA, porque ninguém responde a ele', async () => {
      const { useCase, atendimentos } = montar({
        atendimentos: {
          listarVencidas: jest
            .fn()
            .mockResolvedValue([pendencia({ tipo: 'LEMBRETE' })]),
          buscarPorId: jest.fn().mockResolvedValue({
            id: 'at-1',
            clienteId: 'cl-1',
            vendedoraId: 'vd-1',
            fechadoEm: null,
          }),
          atualizarStatusInteracao: jest.fn().mockResolvedValue(undefined),
        },
      });

      await useCase.execute(AGORA);

      expect(atendimentos.atualizarStatusInteracao).toHaveBeenCalledWith(
        'in-1',
        'ENVIADA',
        AGORA,
      );
    });
  });

  /**
   * O TETO DE ATRASO EXISTE PARA NÃO COBRAR DE MADRUGADA. Mais velho que seis
   * horas expira sem enviar: a vendedora acordaria com uma fila de mensagens
   * fora de contexto — o cenário típico de um scheduler que ficou parado.
   */
  it('atraso acima de seis horas expira, e NÃO envia', async () => {
    const { useCase, whatsapp, atendimentos } = montar({
      atendimentos: {
        listarVencidas: jest
          .fn()
          .mockResolvedValue([pendencia({ notificarEm: DEZ_HORAS_ATRAS })]),
        buscarPorId: jest.fn(),
        atualizarStatusInteracao: jest.fn().mockResolvedValue(undefined),
      },
    });

    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviadas: 0, expiradas: 1 });
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    expect(atendimentos.atualizarStatusInteracao).toHaveBeenCalledWith(
      'in-1',
      'EXPIRADA',
    );
  });

  it('atendimento já fechado expira: o episódio acabou', async () => {
    const { useCase, whatsapp } = montar({
      atendimentos: {
        listarVencidas: jest.fn().mockResolvedValue([pendencia()]),
        buscarPorId: jest.fn().mockResolvedValue({
          id: 'at-1',
          clienteId: 'cl-1',
          vendedoraId: 'vd-1',
          fechadoEm: new Date('2026-10-07T10:00:00-03:00'),
        }),
        atualizarStatusInteracao: jest.fn().mockResolvedValue(undefined),
      },
    });

    const r = await useCase.execute(AGORA);

    expect(r.expiradas).toBe(1);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  /**
   * ========================================================================
   * UMA LINHA RUIM NÃO TRAVA A FILA — e aqui isso vale mais que em qualquer
   * outro lugar, porque quem chama é um scheduler.
   *
   * Sem o try por pendência, uma única linha problemática faria o lote de 50
   * morrer na primeira, TODA rodada, para sempre. E ninguém veria: não há
   * conversa onde o erro apareça.
   * ========================================================================
   */
  it('a que falha fica para a próxima rodada, e as outras saem', async () => {
    const { useCase, whatsapp } = montar({
      atendimentos: {
        listarVencidas: jest
          .fn()
          .mockResolvedValue([
            pendencia({ id: 'ruim' }),
            pendencia({ id: 'boa' }),
          ]),
        buscarPorId: jest
          .fn()
          .mockImplementationOnce(() => Promise.reject(new Error('deadlock')))
          .mockResolvedValue({
            id: 'at-1',
            clienteId: 'cl-1',
            vendedoraId: 'vd-1',
            fechadoEm: null,
          }),
        atualizarStatusInteracao: jest.fn().mockResolvedValue(undefined),
      },
    });

    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviadas: 1, expiradas: 0 });
    expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(1);
  });

  describe('o que não vira envio nem expiração', () => {
    it('fila vazia não consulta mais nada', async () => {
      const { useCase, clientes } = montar({
        atendimentos: {
          listarVencidas: jest.fn().mockResolvedValue([]),
          buscarPorId: jest.fn(),
          atualizarStatusInteracao: jest.fn(),
        },
      });

      const r = await useCase.execute(AGORA);

      expect(r).toEqual({ enviadas: 0, expiradas: 0 });
      expect(clientes.buscarPorId).not.toHaveBeenCalled();
    });

    it('pendência sem hora marcada é adiada, não enviada', async () => {
      const { useCase, whatsapp } = montar({
        atendimentos: {
          listarVencidas: jest
            .fn()
            .mockResolvedValue([pendencia({ notificarEm: null })]),
          buscarPorId: jest.fn(),
          atualizarStatusInteracao: jest.fn(),
        },
      });

      const r = await useCase.execute(AGORA);

      expect(r).toEqual({ enviadas: 0, expiradas: 0 });
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });

    it('número sem conta de WhatsApp adia, e não marca como enviada', async () => {
      const { useCase, atendimentos } = montar({
        whatsapp: {
          resolverChatId: jest.fn().mockResolvedValue(null),
          enviarTexto: jest.fn(),
        },
      });

      const r = await useCase.execute(AGORA);

      expect(r).toEqual({ enviadas: 0, expiradas: 0 });
      expect(atendimentos.atualizarStatusInteracao).not.toHaveBeenCalled();
    });
  });
});
