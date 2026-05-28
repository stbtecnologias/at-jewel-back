import { ConflictException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';
import { CriarVendedoraUseCase } from './criar-vendedora.use-case';

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

describe('CriarVendedoraUseCase', () => {
  const ORIGINAL_ENV = { ...process.env };
  let useCase: CriarVendedoraUseCase;
  let repo: jest.Mocked<IVendedoraRepository>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    repo = makeRepoMock();
    useCase = new CriarVendedoraUseCase(repo);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('cria vendedora com defaults (LOCAL, DISPONIVEL, ativo=true)', async () => {
    repo.criar.mockImplementation((v) => Promise.resolve(v));

    const v = await useCase.execute({ nome: 'Maria' });

    expect(v.tipo).toBe('LOCAL');
    expect(v.statusDisponibilidade).toBe('DISPONIVEL');
    expect(v.ativo).toBe(true);
    expect(v.especialidades).toEqual([]);
  });

  it('calcula email_hash quando email informado', async () => {
    repo.criar.mockImplementation((v) => Promise.resolve(v));

    await useCase.execute({ nome: 'Maria', email: 'maria@loja.com' });

    const created = repo.criar.mock.calls[0][0];
    expect(created.emailHash).toBeTruthy();
    expect(created.emailHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('calcula whatsapp_interno_hash normalizado', async () => {
    repo.criar.mockImplementation((v) => Promise.resolve(v));

    await useCase.execute({ nome: 'Maria', whatsappInterno: '(85) 9 8888-7777' });

    const created = repo.criar.mock.calls[0][0];
    expect(created.whatsappInternoHash).toBeTruthy();
  });

  it('rejeita email duplicado', async () => {
    repo.buscarPorEmailHash.mockResolvedValue({} as Vendedora);
    await expect(
      useCase.execute({ nome: 'Maria', email: 'maria@loja.com' }),
    ).rejects.toThrow(ConflictException);
    expect(repo.criar).not.toHaveBeenCalled();
  });

  it('rejeita whatsapp duplicado', async () => {
    repo.buscarPorWhatsappHash.mockResolvedValue({} as Vendedora);
    await expect(
      useCase.execute({ nome: 'Maria', whatsappInterno: '85988887777' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejeita codigo_erp duplicado', async () => {
    repo.buscarPorCodigoErp.mockResolvedValue({} as Vendedora);
    await expect(
      useCase.execute({ nome: 'Maria', codigoErp: 'V001' }),
    ).rejects.toThrow(ConflictException);
  });

  it('aceita especialidades como array', async () => {
    repo.criar.mockImplementation((v) => Promise.resolve(v));

    await useCase.execute({
      nome: 'Maria',
      especialidades: ['classico', 'noivado'],
    });

    const created = repo.criar.mock.calls[0][0];
    expect(created.especialidades).toEqual(['classico', 'noivado']);
  });
});
