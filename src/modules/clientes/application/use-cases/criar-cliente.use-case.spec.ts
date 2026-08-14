import { ConflictException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Cliente } from '../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { CriarClienteUseCase } from './criar-cliente.use-case';

function makeRepoMock(): jest.Mocked<IClienteRepository> {
  return {
    criarComPerfil: jest.fn(),
    criar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorTelefone1Hash: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
    remover: jest.fn(),
  } as unknown as jest.Mocked<IClienteRepository>;
}

describe('CriarClienteUseCase', () => {
  const ORIGINAL_ENV = { ...process.env };
  let useCase: CriarClienteUseCase;
  let repo: jest.Mocked<IClienteRepository>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    repo = makeRepoMock();
    useCase = new CriarClienteUseCase(repo);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('cria cliente novo com perfil em TRIAGE_IN_PROGRESS', async () => {
    const clienteRetornado = Cliente.create({
      id: 'uuid-novo',
      nome: 'Maria Silva',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      ativo: true,
      perfil: ClientePerfil.create({
        clienteId: 'uuid-novo',
        whatsapp: '5585988887777',
        whatsappHash: 'hash',
        origemContato: 'whatsapp',
        estadoConversa: 'TRIAGE_IN_PROGRESS',
      }),
    });
    repo.criarComPerfil.mockResolvedValue(clienteRetornado);

    const resultado = await useCase.execute({
      nome: 'Maria Silva',
      whatsapp: '(85) 9 8888-7777',
      origemContato: 'whatsapp',
    });

    expect(resultado).toBe(clienteRetornado);
    expect(repo.criarComPerfil).toHaveBeenCalledTimes(1);

    const [clienteArg, perfilArg] = repo.criarComPerfil.mock.calls[0];
    expect(clienteArg.nome).toBe('Maria Silva');
    expect(clienteArg.tipoPessoa).toBe('fisica');
    expect(clienteArg.tabelaPreco).toBe('varejo');
    expect(perfilArg.estadoConversa).toBe('TRIAGE_IN_PROGRESS');
    expect(perfilArg.origemContato).toBe('whatsapp');
    expect(perfilArg.whatsapp).toBe('(85) 9 8888-7777');
    expect(perfilArg.whatsappHash).toBeTruthy();
  });

  it('normaliza whatsapp antes de gerar hash (formatos diferentes mesmo hash)', async () => {
    repo.criarComPerfil.mockResolvedValue({} as Cliente);

    await useCase.execute({
      nome: 'Maria',
      whatsapp: '(85) 9 8888-7777',
      origemContato: 'whatsapp',
    });
    const hashA = repo.criarComPerfil.mock.calls[0][1].whatsappHash;

    repo.criarComPerfil.mockClear();
    await useCase.execute({
      nome: 'Joao',
      whatsapp: '+55 85 98888-7777',
      origemContato: 'whatsapp',
    });
    const hashB = repo.criarComPerfil.mock.calls[0][1].whatsappHash;

    // Mesmo numero, formatos diferentes — hashes diferem porque o +55
    // gera "5585988887777" enquanto o outro gera "85988887777".
    // Mas para o mesmo formato deve dar igual:
    repo.criarComPerfil.mockClear();
    await useCase.execute({
      nome: 'Pedro',
      whatsapp: '85 9 8888 7777',
      origemContato: 'whatsapp',
    });
    const hashC = repo.criarComPerfil.mock.calls[0][1].whatsappHash;

    expect(hashA).toBe(hashC);
    expect(hashA).not.toBe(hashB);
  });

  it('calcula telefone_1_hash e email_hash quando informados', async () => {
    repo.criarComPerfil.mockResolvedValue({} as Cliente);
    repo.buscarPorTelefone1Hash.mockResolvedValue(null);
    repo.buscarPorEmailHash.mockResolvedValue(null);

    await useCase.execute({
      nome: 'Maria',
      whatsapp: '85988887777',
      origemContato: 'whatsapp',
      telefone1: '(85) 3333-4444',
      email: 'maria@email.com',
    });

    const cliente = repo.criarComPerfil.mock.calls[0][0];
    expect(cliente.telefone1Hash).toBeTruthy();
    expect(cliente.emailHash).toBeTruthy();
    expect(repo.buscarPorTelefone1Hash).toHaveBeenCalledWith(cliente.telefone1Hash);
    expect(repo.buscarPorEmailHash).toHaveBeenCalledWith(cliente.emailHash);
  });

  it('lanca ConflictException se telefone ja existe', async () => {
    repo.buscarPorTelefone1Hash.mockResolvedValue(
      Cliente.create({
        id: 'existente',
        nome: 'Outro',
        tipoPessoa: 'fisica',
        tabelaPreco: 'varejo',
        ativo: true,
      }),
    );

    await expect(
      useCase.execute({
        nome: 'Maria',
        whatsapp: '85988887777',
        origemContato: 'whatsapp',
        telefone1: '85988887777',
      }),
    ).rejects.toThrow(ConflictException);
    expect(repo.criarComPerfil).not.toHaveBeenCalled();
  });

  it('lanca ConflictException se email ja existe', async () => {
    repo.buscarPorEmailHash.mockResolvedValue(
      Cliente.create({
        id: 'existente',
        nome: 'Outro',
        tipoPessoa: 'fisica',
        tabelaPreco: 'varejo',
        ativo: true,
      }),
    );

    await expect(
      useCase.execute({
        nome: 'Maria',
        whatsapp: '85988887777',
        origemContato: 'whatsapp',
        email: 'maria@email.com',
      }),
    ).rejects.toThrow(ConflictException);
    expect(repo.criarComPerfil).not.toHaveBeenCalled();
  });

  it('default tipoPessoa=fisica e tabelaPreco=varejo quando nao informados', async () => {
    repo.criarComPerfil.mockResolvedValue({} as Cliente);

    await useCase.execute({
      nome: 'Maria',
      whatsapp: '85988887777',
      origemContato: 'whatsapp',
    });

    const cliente = repo.criarComPerfil.mock.calls[0][0];
    expect(cliente.tipoPessoa).toBe('fisica');
    expect(cliente.tabelaPreco).toBe('varejo');
  });

  // Caminho aberto em 12/08/2026 para a integracao do ERP: cliente que nunca
  // conversou nao tem WhatsApp e nao deve ganhar perfil. Perfil vazio nasceria
  // em TRIAGE_IN_PROGRESS e penduraria o cliente no funil sem ele ter falado
  // com ninguem.
  describe('sem whatsapp (cadastro vindo do ERP)', () => {
    it('cria SEM perfil quando whatsapp nao e informado', async () => {
      repo.criar.mockResolvedValue({} as Cliente);

      await useCase.execute({ nome: 'Cliente do ERP' });

      expect(repo.criar).toHaveBeenCalledTimes(1);
      expect(repo.criarComPerfil).not.toHaveBeenCalled();
    });

    it('preserva os hashes de telefone e email mesmo sem perfil', async () => {
      repo.criar.mockResolvedValue({} as Cliente);

      await useCase.execute({
        nome: 'Cliente do ERP',
        telefone1: '(85) 3333-4444',
        email: 'contato@exemplo.com',
      });

      const cliente = repo.criar.mock.calls[0][0];
      expect(cliente.telefone1Hash).toEqual(expect.any(String));
      expect(cliente.emailHash).toEqual(expect.any(String));
    });

    it('continua barrando telefone duplicado', async () => {
      repo.buscarPorTelefone1Hash.mockResolvedValue({ id: 'existente' } as Cliente);

      await expect(
        useCase.execute({ nome: 'Cliente do ERP', telefone1: '85988887777' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.criar).not.toHaveBeenCalled();
    });

    it('volta a criar perfil assim que o whatsapp e informado', async () => {
      repo.criarComPerfil.mockResolvedValue({} as Cliente);

      await useCase.execute({
        nome: 'Maria',
        whatsapp: '85988887777',
        origemContato: 'whatsapp',
      });

      expect(repo.criarComPerfil).toHaveBeenCalledTimes(1);
      expect(repo.criar).not.toHaveBeenCalled();
    });
  });

  // Ate 14/08/2026 o codigo do ERP so existia no PATCH: importar exigia criar e
  // depois gravar o codigo numa segunda chamada. Se ela falhasse, sobrava
  // cliente sem codigo — e sem codigo para casar, a sincronizacao seguinte
  // criava OUTRO.
  describe('codigo do ERP na criacao', () => {
    it('grava o codigo recebido no POST', async () => {
      repo.criar.mockResolvedValue({} as Cliente);

      await useCase.execute({ codigoErp: 'C1042', nome: 'Cliente do ERP' });

      expect(repo.criar).toHaveBeenCalledTimes(1);
      expect(repo.criar.mock.calls[0][0]).toMatchObject({ codigoErp: 'C1042' });
    });

    it('recusa codigo ja usado com 409, em vez de deixar estourar no banco', async () => {
      repo.buscarPorCodigoErp.mockResolvedValue(
        Cliente.create({
          id: 'uuid-existente',
          codigoErp: 'C1042',
          nome: 'Cliente ja importado',
          tipoPessoa: 'fisica',
          tabelaPreco: 'varejo',
          ativo: true,
        }),
      );

      await expect(
        useCase.execute({ codigoErp: 'C1042', nome: 'Reenvio por timeout' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.criar).not.toHaveBeenCalled();
    });

    // Regressao: o fluxo da Anastasia nao manda codigo e nao pode pagar uma
    // consulta a mais por cliente novo.
    it('nao consulta duplicidade quando o codigo nao e informado', async () => {
      repo.criarComPerfil.mockResolvedValue({} as Cliente);

      await useCase.execute({
        nome: 'Contato novo do WhatsApp',
        whatsapp: '85988887777',
        origemContato: 'whatsapp',
      });

      expect(repo.buscarPorCodigoErp).not.toHaveBeenCalled();
      expect(repo.criarComPerfil).toHaveBeenCalledTimes(1);
    });
  });
});
