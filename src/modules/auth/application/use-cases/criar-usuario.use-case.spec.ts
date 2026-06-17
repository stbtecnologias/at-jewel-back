import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CriarUsuarioUseCase } from './criar-usuario.use-case';
import { AdminUser } from '../../domain/entities/admin-user.entity';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';

function makeRepo(overrides?: Partial<IAdminUserRepository>): IAdminUserRepository {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    create: jest.fn(),
    listarTodos: jest.fn(),
    criarUsuario: jest.fn(async (i) =>
      new AdminUser('u1', i.email, i.passwordHash, null, null, new Date(), i.role, i.nome),
    ),
    remover: jest.fn(),
    updateRefreshToken: jest.fn(),
    atualizarNome: jest.fn(),
    atualizarSenha: jest.fn(),
    ...overrides,
  } as IAdminUserRepository;
}

describe('CriarUsuarioUseCase', () => {
  it('cria usuario so-Google (sem senha) — temSenha=false, email normalizado', async () => {
    const repo = makeRepo();
    const uc = new CriarUsuarioUseCase(repo);
    const out = await uc.execute({ email: '  Nova@Atjewel.COM ', role: 'GERENTE' });
    expect(repo.criarUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'nova@atjewel.com', role: 'GERENTE', passwordHash: null }),
    );
    expect(out.temSenha).toBe(false);
    expect(out.email).toBe('nova@atjewel.com');
  });

  it('cria usuario com senha — hash bcrypt + temSenha=true', async () => {
    const repo = makeRepo();
    const uc = new CriarUsuarioUseCase(repo);
    const out = await uc.execute({ email: 'a@b.com', role: 'VENDEDORA', senha: 'segredo123' });
    const arg = (repo.criarUsuario as jest.Mock).mock.calls[0][0];
    expect(arg.passwordHash).toEqual(expect.any(String));
    expect(await bcrypt.compare('segredo123', arg.passwordHash)).toBe(true);
    expect(out.temSenha).toBe(true);
  });

  it('rejeita e-mail ja existente', async () => {
    const repo = makeRepo({
      findByEmail: jest.fn().mockResolvedValue(
        new AdminUser('x', 'a@b.com', 'h', null, null, new Date(), 'ADMIN', null),
      ),
    });
    const uc = new CriarUsuarioUseCase(repo);
    await expect(uc.execute({ email: 'a@b.com', role: 'ADMIN' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
