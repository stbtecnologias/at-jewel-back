import { randomBytes } from 'crypto';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { BuscarClientePorWhatsappUseCase } from './buscar-cliente-por-whatsapp.use-case';

function makeClienteRepoMock(): jest.Mocked<IClienteRepository> {
  return {
    criarComPerfil: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorTelefone1Hash: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IClienteRepository>;
}

function makePerfilRepoMock(): jest.Mocked<IClientePerfilRepository> {
  return {
    buscarPorClienteId: jest.fn(),
    buscarPorWhatsappHash: jest.fn(),
    atualizar: jest.fn(),
    deletar: jest.fn(),
  } as unknown as jest.Mocked<IClientePerfilRepository>;
}

describe('BuscarClientePorWhatsappUseCase', () => {
  const ORIGINAL_ENV = { ...process.env };
  let useCase: BuscarClientePorWhatsappUseCase;
  let clienteRepo: jest.Mocked<IClienteRepository>;
  let perfilRepo: jest.Mocked<IClientePerfilRepository>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    clienteRepo = makeClienteRepoMock();
    perfilRepo = makePerfilRepoMock();
    useCase = new BuscarClientePorWhatsappUseCase(clienteRepo, perfilRepo);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('retorna null se whatsapp nao encontrado', async () => {
    perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);

    const resultado = await useCase.execute('85988887777');

    expect(resultado).toBeNull();
    expect(clienteRepo.buscarPorId).not.toHaveBeenCalled();
  });

  it('busca por hash normalizado (remove formatacao)', async () => {
    perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);

    await useCase.execute('(85) 9 8888-7777');

    const hashEsperado = hashField('85988887777');
    expect(perfilRepo.buscarPorWhatsappHash).toHaveBeenCalledWith(hashEsperado);
  });

  it('quando encontra perfil, busca cliente completo com perfil', async () => {
    const perfil = ClientePerfil.create({
      clienteId: 'uuid-cliente',
      whatsapp: '85988887777',
      whatsappHash: 'hash',
      estadoConversa: 'TRIAGE_IN_PROGRESS',
    });
    const cliente = Cliente.create({
      id: 'uuid-cliente',
      nome: 'Maria',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      ativo: true,
      perfil,
    });
    perfilRepo.buscarPorWhatsappHash.mockResolvedValue(perfil);
    clienteRepo.buscarPorId.mockResolvedValue(cliente);

    const resultado = await useCase.execute('85988887777');

    expect(resultado).toBe(cliente);
    expect(clienteRepo.buscarPorId).toHaveBeenCalledWith('uuid-cliente', {
      incluirPerfil: true,
    });
  });
});
