import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AtualizarUsuarioUseCase } from './atualizar-usuario.use-case';
import { AdminUser } from '../../domain/entities/admin-user.entity';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';

const ALVO = new AdminUser(
  'u1',
  'marina@atjewel.com',
  null,
  null,
  null,
  new Date('2026-01-01'),
  'ADMIN',
  'Marina',
  '(85) 98646-7241',
);

function makeRepo(overrides?: Partial<IAdminUserRepository>): IAdminUserRepository {
  return {
    findByEmail: jest.fn(),
    findById: jest.fn().mockResolvedValue(ALVO),
    buscarPorTelefoneHash: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    listarTodos: jest.fn(),
    criarUsuario: jest.fn(),
    atualizarDados: jest.fn(async () => ALVO),
    remover: jest.fn(),
    updateRefreshToken: jest.fn(),
    atualizarNome: jest.fn(),
    atualizarSenha: jest.fn(),
    ...overrides,
  } as IAdminUserRepository;
}

describe('AtualizarUsuarioUseCase', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  /**
   * O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
   *
   * Abrir a tela e salvar sem mexer no telefone e o gesto mais comum de todos.
   * Se a busca por duplicata nao ignorasse o proprio usuario, isso daria 409
   * contra ele mesmo — e o erro pareceria sair do nada, porque nada mudou.
   */
  it('salvar sem trocar o telefone nao acusa duplicata contra si mesmo', async () => {
    const repo = makeRepo({
      // O banco devolve o PROPRIO usuario para o hash consultado.
      buscarPorTelefoneHash: jest.fn().mockResolvedValue(ALVO),
    });
    const uc = new AtualizarUsuarioUseCase(repo);

    await expect(
      uc.execute({ id: 'u1', telefone: '(85) 98646-7241' }),
    ).resolves.toBeDefined();
    expect(repo.atualizarDados).toHaveBeenCalled();
  });

  it('recusa telefone que ja e de OUTRO usuario', async () => {
    const outro = new AdminUser(
      'u2',
      'outra@atjewel.com',
      null,
      null,
      null,
      new Date(),
      'ADMIN',
      'Outra',
      '(85) 98646-7241',
    );
    const repo = makeRepo({
      buscarPorTelefoneHash: jest.fn().mockResolvedValue(outro),
    });
    const uc = new AtualizarUsuarioUseCase(repo);

    await expect(
      uc.execute({ id: 'u1', telefone: '(85) 98646-7241' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.atualizarDados).not.toHaveBeenCalled();
  });

  it('telefone vazio APAGA os dois campos', async () => {
    const repo = makeRepo();
    const uc = new AtualizarUsuarioUseCase(repo);

    await uc.execute({ id: 'u1', telefone: '' });

    expect(repo.atualizarDados).toHaveBeenCalledWith('u1', {
      telefone: null,
      telefoneHash: null,
    });
  });

  it('campo ausente nao e tocado', async () => {
    const repo = makeRepo();
    const uc = new AtualizarUsuarioUseCase(repo);

    await uc.execute({ id: 'u1', nome: 'Marina Albuquerque' });

    const dados = (repo.atualizarDados as jest.Mock).mock.calls[0][1];
    expect(dados).toEqual({ nome: 'Marina Albuquerque' });
    expect('telefone' in dados).toBe(false);
    expect(repo.buscarPorTelefoneHash).not.toHaveBeenCalled();
  });

  it('nada para mudar nao vai ao banco', async () => {
    const repo = makeRepo();
    const uc = new AtualizarUsuarioUseCase(repo);

    const out = await uc.execute({ id: 'u1' });

    expect(repo.atualizarDados).not.toHaveBeenCalled();
    expect(out.id).toBe('u1');
  });

  it('usuario inexistente devolve 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const uc = new AtualizarUsuarioUseCase(repo);

    await expect(uc.execute({ id: 'sumido', nome: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('o telefone volta na visao publica, ja decifrado', async () => {
    const repo = makeRepo();
    const uc = new AtualizarUsuarioUseCase(repo);

    const out = await uc.execute({ id: 'u1', nome: 'Marina' });

    expect(out.telefone).toBe('(85) 98646-7241');
  });
});
