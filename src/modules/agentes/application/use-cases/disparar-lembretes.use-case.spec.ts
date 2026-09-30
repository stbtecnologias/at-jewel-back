import { DispararLembretesUseCase } from './disparar-lembretes.use-case';

/**
 * O CRON DOS LEMBRETES — 30/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE.
 *
 * 1. O ATRASO NAO CALA O LEMBRETE. A pendencia de atendimento expira em 6h
 *    porque cobranca atrasada e ruido; o lembrete, nao — some-lo em silencio
 *    e a falha que a funcionalidade inteira existe para evitar. Ele chega
 *    atrasado DIZENDO a hora original.
 * 2. O teto de 12h existe mesmo assim, para a queda longa: um lembrete de
 *    terca entregue na quinta e susto, nao lembrete.
 * 3. Um item com problema nao trava a fila.
 * ==========================================================================
 */

const AGORA = new Date('2026-09-30T15:00:00-03:00');
const DONO = { id: 'adm-1', nome: 'Lucas', telefone: '5585999990000' };

const umLembrete = (over: Partial<{ id: string; quando: Date; texto: string }> = {}) => ({
  id: over.id ?? 'lem-1',
  donoId: DONO.id,
  texto: over.texto ?? 'passar na Faby e pegar o bolo',
  quando: over.quando ?? new Date(AGORA.getTime() - 30_000),
});

describe('DispararLembretesUseCase', () => {
  let lembretes: {
    vencidos: jest.Mock;
    fechar: jest.Mock;
  };
  let admins: { findById: jest.Mock };
  let whatsapp: { resolverChatId: jest.Mock; enviarTexto: jest.Mock };
  let useCase: DispararLembretesUseCase;

  /** O texto que saiu — a asserção mais usada aqui. */
  const enviado = () => whatsapp.enviarTexto.mock.calls[0]?.[1] as string;

  beforeEach(() => {
    lembretes = {
      vencidos: jest.fn().mockResolvedValue([]),
      fechar: jest.fn().mockResolvedValue(undefined),
    };
    admins = { findById: jest.fn().mockResolvedValue(DONO) };
    whatsapp = {
      resolverChatId: jest.fn().mockResolvedValue('5585999990000@c.us'),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new DispararLembretesUseCase(
      lembretes as never,
      admins as never,
      whatsapp as never,
    );
  });

  it('fila vazia nao consulta nada nem envia', async () => {
    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviados: 0, perdidos: 0 });
    expect(admins.findById).not.toHaveBeenCalled();
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('envia na hora, pelo numero da Anastasia, e fecha como ENVIADO', async () => {
    lembretes.vencidos.mockResolvedValue([umLembrete()]);

    const r = await useCase.execute(AGORA);

    expect(r.enviados).toBe(1);
    expect(enviado()).toBe('Lembrete: passar na Faby e pegar o bolo');
    expect(whatsapp.enviarTexto.mock.calls[0][2]).toBe('ANASTASIA');
    expect(lembretes.fechar).toHaveBeenCalledWith('lem-1', 'ENVIADO');
  });

  it('o texto vai PALAVRA POR PALAVRA, sem reescrever', async () => {
    lembretes.vencidos.mockResolvedValue([
      umLembrete({ texto: 'buscar o bolo da Faby, sem falta' }),
    ]);

    await useCase.execute(AGORA);

    expect(enviado()).toContain('buscar o bolo da Faby, sem falta');
  });

  it('atrasado DUAS horas: envia mesmo assim, dizendo a hora original', async () => {
    lembretes.vencidos.mockResolvedValue([
      umLembrete({ quando: new Date(AGORA.getTime() - 2 * 3_600_000) }),
    ]);

    const r = await useCase.execute(AGORA);

    expect(r.enviados).toBe(1);
    expect(enviado()).toContain('só chegou agora');
    expect(enviado()).toContain('13:00');
  });

  it('atrasado TREZE horas: vira PERDIDO e NAO envia', async () => {
    lembretes.vencidos.mockResolvedValue([
      umLembrete({ quando: new Date(AGORA.getTime() - 13 * 3_600_000) }),
    ]);

    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviados: 0, perdidos: 1 });
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    expect(lembretes.fechar).toHaveBeenCalledWith('lem-1', 'PERDIDO');
  });

  it('dono sem telefone: nao envia e NAO fecha — o lembrete continua esperando', async () => {
    admins.findById.mockResolvedValue({ ...DONO, telefone: null });
    lembretes.vencidos.mockResolvedValue([umLembrete()]);

    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviados: 0, perdidos: 0 });
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    expect(lembretes.fechar).not.toHaveBeenCalled();
  });

  it('telefone sem conta de WhatsApp: mesma coisa — continua esperando', async () => {
    whatsapp.resolverChatId.mockResolvedValue(null);
    lembretes.vencidos.mockResolvedValue([umLembrete()]);

    const r = await useCase.execute(AGORA);

    expect(r).toEqual({ enviados: 0, perdidos: 0 });
    expect(lembretes.fechar).not.toHaveBeenCalled();
  });

  it('um lembrete com problema NAO trava os outros', async () => {
    lembretes.vencidos.mockResolvedValue([
      umLembrete({ id: 'lem-1' }),
      umLembrete({ id: 'lem-2' }),
    ]);
    whatsapp.enviarTexto
      .mockRejectedValueOnce(new Error('WAHA fora do ar'))
      .mockResolvedValueOnce(undefined);

    const r = await useCase.execute(AGORA);

    expect(r.enviados).toBe(1);
    expect(lembretes.fechar).toHaveBeenCalledWith('lem-2', 'ENVIADO');
    // O que falhou nao foi fechado: fica PENDENTE e volta na proxima rodada.
    expect(lembretes.fechar).not.toHaveBeenCalledWith('lem-1', 'ENVIADO');
  });

  it('cada dono recebe o seu, no proprio numero', async () => {
    const outra = { id: 'adm-2', nome: 'Fabi', telefone: '5585988880000' };
    lembretes.vencidos.mockResolvedValue([
      umLembrete({ id: 'lem-1', texto: 'o meu' }),
      { ...umLembrete({ id: 'lem-2', texto: 'o dela' }), donoId: outra.id },
    ]);
    admins.findById.mockImplementation((id: string) =>
      Promise.resolve(id === DONO.id ? DONO : outra),
    );
    whatsapp.resolverChatId.mockImplementation((tel: string) =>
      Promise.resolve(`${tel}@c.us`),
    );

    await useCase.execute(AGORA);

    expect(whatsapp.enviarTexto).toHaveBeenNthCalledWith(
      1,
      `${DONO.telefone}@c.us`,
      'Lembrete: o meu',
      'ANASTASIA',
    );
    expect(whatsapp.enviarTexto).toHaveBeenNthCalledWith(
      2,
      `${outra.telefone}@c.us`,
      'Lembrete: o dela',
      'ANASTASIA',
    );
  });
});
