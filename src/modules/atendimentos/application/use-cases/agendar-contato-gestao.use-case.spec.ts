import { AgendarContatoGestaoUseCase } from './agendar-contato-gestao.use-case';

/**
 * O ADM agendando na agenda de outra pessoa.
 *
 * O TESTE QUE ESTE ARQUIVO EXISTE PARA PROTEGER e o da ordem entre transferir
 * e a trava do atendimento. Em 21/08 a trava vinha primeiro: quando o cliente
 * tinha episodio aberto com a vendedora antiga, o metodo retornava SEM
 * transferir, mesmo com o ADM tendo dito "transfere". A carteira ficava como
 * estava, e a resposta nao dizia isso — o pior tipo de erro, o que parece ter
 * dado certo.
 */
describe('AgendarContatoGestaoUseCase', () => {
  const DAQUI_A_UMA_HORA = new Date(Date.now() + 60 * 60_000).toISOString();

  const CLIENTE = {
    id: 'cli-1',
    nome: 'Carla Oliveira',
    codigoErp: 'SEED-C0002',
    vendedoraCodigoErp: 'SEED-VD01', // carteira da Marina
  };

  const DESTINO = {
    vendedoraId: 'vd-2',
    vendedoraNome: 'Camila Rezende',
    vendedoraCodigoErp: 'SEED-VD02',
  };

  let atendimentos: {
    buscarAbertoPorCliente: jest.Mock;
    abrir: jest.Mock;
    reagendar: jest.Mock;
    criarInteracao: jest.Mock;
  };
  let clientes: {
    buscarPorCodigoErp: jest.Mock;
    buscarPorNomeParcial: jest.Mock;
    transferirCarteira: jest.Mock;
  };
  let vendedoras: { buscarPorCodigoErp: jest.Mock; buscarPorId: jest.Mock };
  let useCase: AgendarContatoGestaoUseCase;

  beforeEach(() => {
    atendimentos = {
      buscarAbertoPorCliente: jest.fn().mockResolvedValue(null),
      abrir: jest.fn().mockResolvedValue({ id: 'at-1' }),
      reagendar: jest.fn(),
      criarInteracao: jest.fn(),
    };
    clientes = {
      buscarPorCodigoErp: jest.fn().mockResolvedValue(null),
      buscarPorNomeParcial: jest.fn().mockResolvedValue([CLIENTE]),
      transferirCarteira: jest.fn(),
    };
    vendedoras = {
      buscarPorCodigoErp: jest.fn().mockResolvedValue({ nome: 'Marina Albuquerque' }),
      buscarPorId: jest.fn().mockResolvedValue({ nome: 'Marina Albuquerque' }),
    };

    useCase = new AgendarContatoGestaoUseCase(
      atendimentos as never,
      clientes as never,
      vendedoras as never,
    );
  });

  it('cliente de outra carteira PARA o fluxo e nao escreve nada', async () => {
    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: DAQUI_A_UMA_HORA,
    });

    expect(r.status).toBe('CARTEIRA_DE_OUTRA');
    expect(clientes.transferirCarteira).not.toHaveBeenCalled();
    expect(atendimentos.abrir).not.toHaveBeenCalled();
    expect(atendimentos.reagendar).not.toHaveBeenCalled();
  });

  it('OCASIONAL agenda e NAO encosta na carteira', async () => {
    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: DAQUI_A_UMA_HORA,
      modo: 'OCASIONAL',
    });

    expect(r.status).toBe('AGENDADO');
    expect(clientes.transferirCarteira).not.toHaveBeenCalled();
    expect(atendimentos.abrir).toHaveBeenCalled();
  });

  it('TRANSFERIR move a carteira e agenda', async () => {
    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: DAQUI_A_UMA_HORA,
      modo: 'TRANSFERIR',
    });

    expect(clientes.transferirCarteira).toHaveBeenCalledWith('cli-1', 'SEED-VD02');
    expect(r.status).toBe('AGENDADO');
    if (r.status === 'AGENDADO') expect(r.transferido).toBe(true);
  });

  /**
   * O BUG DE 21/08, agora com rede.
   */
  it('TRANSFERIR com episodio aberto de outra: transfere mesmo assim e AVISA', async () => {
    atendimentos.buscarAbertoPorCliente.mockResolvedValue({
      id: 'at-antigo',
      vendedoraId: 'vd-1', // Marina, a antiga
    });

    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: DAQUI_A_UMA_HORA,
      modo: 'TRANSFERIR',
    });

    // A carteira MUDOU — era isso que estava sendo pulado em silencio.
    expect(clientes.transferirCarteira).toHaveBeenCalledWith('cli-1', 'SEED-VD02');

    // Mas o episodio da outra pessoa ficou intocado, e o resultado diz as duas
    // coisas: nao agendou, e transferiu.
    expect(r.status).toBe('ATENDIMENTO_DE_OUTRA_PESSOA');
    if (r.status === 'ATENDIMENTO_DE_OUTRA_PESSOA') {
      expect(r.transferido).toBe(true);
      expect(r.vendedora).toBe('Marina Albuquerque');
    }
    expect(atendimentos.reagendar).not.toHaveBeenCalled();
  });

  it('sem transferir, episodio aberto de outra tambem nao agenda', async () => {
    atendimentos.buscarAbertoPorCliente.mockResolvedValue({
      id: 'at-antigo',
      vendedoraId: 'vd-1',
    });

    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: DAQUI_A_UMA_HORA,
      modo: 'OCASIONAL',
    });

    expect(r.status).toBe('ATENDIMENTO_DE_OUTRA_PESSOA');
    if (r.status === 'ATENDIMENTO_DE_OUTRA_PESSOA') expect(r.transferido).toBe(false);
    expect(clientes.transferirCarteira).not.toHaveBeenCalled();
  });

  it('cliente SEM carteira nao para o fluxo — agenda direto', async () => {
    clientes.buscarPorNomeParcial.mockResolvedValue([
      { ...CLIENTE, vendedoraCodigoErp: null },
    ]);

    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: DAQUI_A_UMA_HORA,
    });

    expect(r.status).toBe('AGENDADO');
    expect(clientes.transferirCarteira).not.toHaveBeenCalled();
  });

  it('homonimos devolvem CODIGO e CARTEIRA, para dar como desempatar', async () => {
    clientes.buscarPorNomeParcial.mockResolvedValue([
      { ...CLIENTE, id: 'a', codigoErp: 'SEED-C0003' },
      { ...CLIENTE, id: 'b', codigoErp: 'SEED-C0051', vendedoraCodigoErp: null },
    ]);

    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: DAQUI_A_UMA_HORA,
    });

    expect(r.status).toBe('CLIENTE_AMBIGUO');
    if (r.status === 'CLIENTE_AMBIGUO') {
      expect(r.opcoes[0]).toContain('SEED-C0003');
      expect(r.opcoes[0]).toContain('Marina');
      expect(r.opcoes[1]).toContain('sem vendedora');
    }
  });

  it('o codigo tem precedencia sobre o nome — e como se desempata', async () => {
    clientes.buscarPorCodigoErp.mockResolvedValue(CLIENTE);

    await useCase.execute({
      ...DESTINO,
      nomeCliente: 'SEED-C0002',
      quandoIso: DAQUI_A_UMA_HORA,
      modo: 'OCASIONAL',
    });

    expect(clientes.buscarPorCodigoErp).toHaveBeenCalledWith('SEED-C0002');
    expect(clientes.buscarPorNomeParcial).not.toHaveBeenCalled();
  });

  it('horario no passado e recusado antes de qualquer busca', async () => {
    const r = await useCase.execute({
      ...DESTINO,
      nomeCliente: 'Carla Oliveira',
      quandoIso: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(r.status).toBe('HORARIO_INVALIDO');
    expect(clientes.buscarPorNomeParcial).not.toHaveBeenCalled();
  });
});
