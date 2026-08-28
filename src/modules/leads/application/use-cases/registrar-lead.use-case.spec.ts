import { randomBytes } from 'crypto';
import { BuscarClientePorWhatsappUseCase } from '../../../clientes/application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import type {
  ILeadRepository,
  Lead,
} from '../../domain/ports/repositories/lead-repository.port';
import { AvisarGestaoDeLeadUseCase } from './avisar-gestao-de-lead.use-case';
import { RegistrarLeadUseCase } from './registrar-lead.use-case';

function leadFake(over: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    nome: null,
    apelido: null,
    whatsapp: '5585999990001',
    origemContato: null,
    ocasiao: null,
    produtosDesejados: null,
    resumoTriagem: null,
    vendedoraSugeridaCodigo: null,
    estado: 'TRIAGE_IN_PROGRESS',
    estadoAtualizadoEm: new Date(),
    clienteId: null,
    vinculadoEm: null,
    direcionadoGestaoEm: null,
    fechadoEm: null,
    criadoEm: new Date(),
    ...over,
  };
}

function makeLeadRepo(): jest.Mocked<ILeadRepository> {
  return {
    buscarAbertoPorHash: jest.fn().mockResolvedValue(null),
    buscarUltimoPorHash: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn(),
    criar: jest.fn().mockImplementation((i) => Promise.resolve(leadFake(i))),
    atualizar: jest
      .fn()
      .mockImplementation((id, i) => Promise.resolve(leadFake({ id, ...i }))),
    vincularCliente: jest.fn(),
  };
}

describe('RegistrarLeadUseCase', () => {
  const ORIGINAL_ENV = { ...process.env };
  let useCase: RegistrarLeadUseCase;
  let leads: jest.Mocked<ILeadRepository>;
  let clientes: jest.Mocked<IClienteRepository>;
  let buscarCliente: jest.Mocked<BuscarClientePorWhatsappUseCase>;
  let avisarGestao: jest.Mocked<AvisarGestaoDeLeadUseCase>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');

    leads = makeLeadRepo();
    clientes = {
      buscarPorTelefone1Hash: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IClienteRepository>;
    buscarCliente = {
      execute: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<BuscarClientePorWhatsappUseCase>;

    avisarGestao = {
      execute: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<AvisarGestaoDeLeadUseCase>;

    useCase = new RegistrarLeadUseCase(
      leads,
      clientes,
      buscarCliente,
      avisarGestao,
    );
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('numero que ninguem conhece nasce como lead novo, sem nome', async () => {
    const r = await useCase.execute({ whatsapp: '85999990001' });

    expect(r.reconhecimento).toBe('NOVO');
    expect(r.conhecido).toBe(false);
    expect(leads.criar).toHaveBeenCalledTimes(1);
  });

  it('com lead ABERTO, continua a conversa em vez de abrir outra', async () => {
    leads.buscarAbertoPorHash.mockResolvedValue(leadFake({ nome: 'Carla' }));

    const r = await useCase.execute({
      whatsapp: '85999990001',
      ocasiao: 'NOIVADO',
    });

    expect(r.reconhecimento).toBe('CONVERSA_EM_ANDAMENTO');
    expect(leads.atualizar).toHaveBeenCalledWith('lead-1', expect.anything());
    // O ponto do teste: NAO cria um segundo lead para quem ja esta falando.
    expect(leads.criar).not.toHaveBeenCalled();
  });

  it('herda nome do lead anterior, mas NAO herda a ocasiao', async () => {
    leads.buscarUltimoPorHash.mockResolvedValue(
      leadFake({ nome: 'Carla', ocasiao: 'NOIVADO', fechadoEm: new Date() }),
    );

    const r = await useCase.execute({
      whatsapp: '85999990001',
      ocasiao: 'ANIVERSARIO',
    });

    expect(r.reconhecimento).toBe('LEAD_ANTERIOR');
    expect(leads.criar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Carla', ocasiao: 'ANIVERSARIO' }),
    );
  });

  it('sem ocasiao nova, o lead anterior nao empresta a antiga', async () => {
    leads.buscarUltimoPorHash.mockResolvedValue(
      leadFake({ nome: 'Carla', ocasiao: 'NOIVADO', fechadoEm: new Date() }),
    );

    await useCase.execute({ whatsapp: '85999990001' });

    // Voltar em dezembro nao significa querer a mesma coisa de novembro: a
    // Anastasia precisa perguntar, nao presumir.
    expect(leads.criar).toHaveBeenCalledWith(
      expect.objectContaining({ ocasiao: null }),
    );
  });

  it('reconhece quem ja e cliente do ERP e amarra o cliente_id', async () => {
    buscarCliente.execute.mockResolvedValue({
      id: 'cli-9',
      nome: 'Beatriz',
    } as never);

    const r = await useCase.execute({ whatsapp: '85999990001' });

    expect(r.reconhecimento).toBe('CLIENTE_ERP');
    expect(r.conhecido).toBe(true);
    expect(leads.criar).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: 'cli-9', nome: 'Beatriz' }),
    );
  });

  it('acha o cliente por telefone1 quando ele nao tem WhatsApp no cadastro', async () => {
    // `clientes_perfil` — onde mora o whatsapp_hash — so nasce se o cliente
    // tiver WhatsApp. Sem este fallback, quem veio do Safira so com telefone1
    // jamais seria reconhecido.
    buscarCliente.execute.mockResolvedValue(null);
    clientes.buscarPorTelefone1Hash.mockResolvedValue({
      id: 'cli-7',
      nome: 'Helena',
    } as never);

    const r = await useCase.execute({ whatsapp: '85999990001' });

    expect(r.reconhecimento).toBe('CLIENTE_ERP');
    expect(leads.criar).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: 'cli-7' }),
    );
  });

  it('o nome informado agora ganha do nome herdado', async () => {
    leads.buscarUltimoPorHash.mockResolvedValue(
      leadFake({ nome: 'Carla', fechadoEm: new Date() }),
    );

    await useCase.execute({ whatsapp: '85999990001', nome: 'Carla Souza' });

    expect(leads.criar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Carla Souza' }),
    );
  });

  it('tenta as variantes do numero antes de desistir', async () => {
    await useCase.execute({ whatsapp: '+55 85 99999-0001' });

    // Nono digito e DDI fazem o mesmo numero chegar de varias formas; um falso
    // negativo aqui cria lead duplicado em silencio.
    expect(leads.buscarAbertoPorHash.mock.calls.length).toBeGreaterThan(1);
  });

  describe('subida para a gestao', () => {
    it('avisa a gestao quando a triagem termina, e carimba o horario', async () => {
      leads.buscarAbertoPorHash.mockResolvedValue(leadFake({ nome: 'Marina' }));

      await useCase.execute({
        whatsapp: '85999990001',
        prontoParaEncaminhar: true,
      });

      expect(leads.atualizar).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({
          estado: 'READY_FOR_ROUTING',
          direcionadoGestaoEm: expect.any(Date),
        }),
      );
      expect(avisarGestao.execute).toHaveBeenCalledTimes(1);
    });

    it('NAO avisa de novo se o lead ja subiu — o atwpp repete o sinal a cada mensagem', async () => {
      leads.buscarAbertoPorHash.mockResolvedValue(
        leadFake({ estado: 'READY_FOR_ROUTING' }),
      );
      leads.atualizar.mockResolvedValue(
        leadFake({ estado: 'READY_FOR_ROUTING' }),
      );

      await useCase.execute({
        whatsapp: '85999990001',
        prontoParaEncaminhar: true,
      });

      expect(avisarGestao.execute).not.toHaveBeenCalled();
    });

    it('sem o sinal, nao mexe no estado nem avisa ninguem', async () => {
      leads.buscarAbertoPorHash.mockResolvedValue(leadFake());

      await useCase.execute({ whatsapp: '85999990001', nome: 'Marina' });

      expect(avisarGestao.execute).not.toHaveBeenCalled();
    });

    it('falha no aviso nao derruba o registro do lead', async () => {
      leads.buscarAbertoPorHash.mockResolvedValue(leadFake());
      avisarGestao.execute.mockRejectedValue(new Error('WAHA fora do ar'));

      const r = await useCase.execute({
        whatsapp: '85999990001',
        prontoParaEncaminhar: true,
      });

      // Perder a notificacao e ruim; perder o lead seria pior.
      expect(r.lead).toBeDefined();
    });
  });
});
