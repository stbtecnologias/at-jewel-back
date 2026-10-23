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
    proximoCodigoInterno: jest.fn().mockResolvedValue('VD-0001'),
    // Uma equipe ativa, que e o caso da casa desde 23/10/2026.
    equipePadrao: jest.fn().mockResolvedValue('eq-1'),
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

  // =========================================================================
  // ELA NASCE NA EQUIPE — 23/10/2026.
  //
  // O recorte da gerente de vendas e a equipe DELA. Vendedora sem equipe fica
  // invisivel para a gerente, e vendedora nova chega sozinha pela API do ERP
  // (21 das 23 nasceram assim em agosto/2026). Sem esta regra, a proxima
  // sumiria do painel da gerente sem ninguem ser avisado — e numero que
  // encolhe calado e pior que numero ausente.
  // =========================================================================
  it('nasce na equipe padrao — e e isso que a faz existir para a gerente', async () => {
    repo.criar.mockImplementation((v) => Promise.resolve(v));

    await useCase.execute({ nome: 'Maria' });

    expect(repo.criar.mock.calls[0][0].equipeId).toBe('eq-1');
  });

  /*
   * COM DUAS EQUIPES, ESCOLHER SERIA ADIVINHAR de qual time a pessoa e — e o
   * caso que chega no dia em que SP entrar. Ai ela nasce sem equipe e quem
   * cadastra decide, que e o comportamento de antes desta regra.
   */
  it('sem saber qual equipe, nasce sem equipe — e nao na primeira que achar', async () => {
    repo.equipePadrao.mockResolvedValue(null);
    repo.criar.mockImplementation((v) => Promise.resolve(v));

    await useCase.execute({ nome: 'Maria' });

    expect(repo.criar.mock.calls[0][0].equipeId).toBeNull();
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
