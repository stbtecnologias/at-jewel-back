import { NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';
import { AtualizarVendedoraUseCase } from './atualizar-vendedora.use-case';

function makeRepoMock(): jest.Mocked<IVendedoraRepository> {
  return {
    criar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    buscarPorWhatsappHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IVendedoraRepository>;
}

function makeVendedora(overrides: Partial<Vendedora> = {}): Vendedora {
  return Vendedora.create({
    id: 'uuid-v',
    codigoErp: 'V001',
    nome: 'Maria',
    tipo: 'LOCAL',
    ativo: true,
    statusDisponibilidade: 'DISPONIVEL',
    especialidades: ['classico'],
    email: 'maria@loja.com',
    emailHash: 'hash-original',
    whatsappInterno: '85988887777',
    whatsappInternoHash: 'hash-wpp-original',
    ...overrides,
  });
}

describe('AtualizarVendedoraUseCase', () => {
  const ORIGINAL_ENV = { ...process.env };
  let useCase: AtualizarVendedoraUseCase;
  let repo: jest.Mocked<IVendedoraRepository>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    repo = makeRepoMock();
    useCase = new AtualizarVendedoraUseCase(repo);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('404 se vendedora nao existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);
    await expect(useCase.execute('inexistente', { nome: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('mantem campos nao informados', async () => {
    repo.buscarPorId.mockResolvedValue(makeVendedora());
    repo.atualizar.mockImplementation((v) => Promise.resolve(v));

    const result = await useCase.execute('uuid-v', { statusDisponibilidade: 'AUSENTE' });

    expect(result.statusDisponibilidade).toBe('AUSENTE');
    expect(result.nome).toBe('Maria'); // preservado
    expect(result.especialidades).toEqual(['classico']); // preservado
  });

  it('recalcula email_hash quando email muda', async () => {
    repo.buscarPorId.mockResolvedValue(makeVendedora());
    repo.atualizar.mockImplementation((v) => Promise.resolve(v));

    const result = await useCase.execute('uuid-v', { email: 'novo@loja.com' });

    expect(result.email).toBe('novo@loja.com');
    expect(result.emailHash).not.toBe('hash-original');
    expect(result.emailHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('NAO recalcula hash se email nao mudou', async () => {
    repo.buscarPorId.mockResolvedValue(makeVendedora());
    repo.atualizar.mockImplementation((v) => Promise.resolve(v));

    const result = await useCase.execute('uuid-v', { nome: 'Maria Silva' });

    expect(result.emailHash).toBe('hash-original');
  });

  it('zera hash quando email vira null', async () => {
    repo.buscarPorId.mockResolvedValue(makeVendedora());
    repo.atualizar.mockImplementation((v) => Promise.resolve(v));

    const result = await useCase.execute('uuid-v', { email: null });

    expect(result.email).toBeNull();
    expect(result.emailHash).toBeNull();
  });

  it('permite desativar vendedora', async () => {
    repo.buscarPorId.mockResolvedValue(makeVendedora());
    repo.atualizar.mockImplementation((v) => Promise.resolve(v));

    const result = await useCase.execute('uuid-v', { ativo: false });

    expect(result.ativo).toBe(false);
  });
});
