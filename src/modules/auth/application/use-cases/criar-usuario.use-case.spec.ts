import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { CriarUsuarioUseCase } from './criar-usuario.use-case';
import { AdminUser } from '../../domain/entities/admin-user.entity';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import type { IRoleRepository } from '../../domain/ports/repositories/role-repository.port';

function makeRepo(overrides?: Partial<IAdminUserRepository>): IAdminUserRepository {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    buscarPorTelefoneHash: jest.fn().mockResolvedValue(null),
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

// Papel sempre existente nos testes (validacao dinamica de role).
function makeRoles(): IRoleRepository {
  return {
    listar: jest.fn(),
    buscar: jest.fn(async (chave: string) => ({
      chave,
      nome: chave,
      descricao: null,
      isSystem: true,
      permissoes: [],
    })),
    criar: jest.fn(),
    definirPermissoes: jest.fn(),
    atualizarMeta: jest.fn(),
    remover: jest.fn(),
    contarUsuarios: jest.fn(),
  } as IRoleRepository;
}

describe('CriarUsuarioUseCase', () => {
  // hashField exige HASH_SECRET. Mesmo padrao dos specs de cliente e vendedora:
  // segredo aleatorio por execucao, e o env restaurado depois.
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('cria usuario so-Google (sem senha) — temSenha=false, email normalizado', async () => {
    const repo = makeRepo();
    const uc = new CriarUsuarioUseCase(repo, makeRoles());
    const out = await uc.execute({ email: '  Nova@Atjewel.COM ', role: 'GERENTE' });
    expect(repo.criarUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'nova@atjewel.com', role: 'GERENTE', passwordHash: null }),
    );
    expect(out.temSenha).toBe(false);
    expect(out.email).toBe('nova@atjewel.com');
  });

  it('cria usuario com senha — hash bcrypt + temSenha=true', async () => {
    const repo = makeRepo();
    const uc = new CriarUsuarioUseCase(repo, makeRoles());
    const out = await uc.execute({ email: 'a@b.com', role: 'VENDEDORA', senha: 'segredo123' });
    const arg = (repo.criarUsuario as jest.Mock).mock.calls[0][0];
    expect(arg.passwordHash).toEqual(expect.any(String));
    expect(await bcrypt.compare('segredo123', arg.passwordHash)).toBe(true);
    expect(out.temSenha).toBe(true);
  });


  /**
   * TELEFONE (migracao 37).
   *
   * O teste que importa e o das FORMAS EQUIVALENTES. O mesmo celular
   * cadastrado com e sem o nono digito viraria dois usuarios, e o canal de
   * WhatsApp resolveria para um deles conforme o formato que o provedor
   * entregasse — errado de um jeito que so aparece meses depois.
   */
  describe('telefone', () => {
    it('normaliza a mascara e guarda o numero como foi digitado', async () => {
      const repo = makeRepo();
      const uc = new CriarUsuarioUseCase(repo, makeRoles());

      await uc.execute({ email: 'a@b.com', role: 'ADMIN', telefone: '(85) 9 8646-7241' });

      const arg = (repo.criarUsuario as jest.Mock).mock.calls[0][0];
      expect(arg.telefone).toBe('(85) 9 8646-7241');
      // O hash e do numero SO COM DIGITOS: e o que faz mascaras diferentes
      // do mesmo celular acharem o mesmo registro.
      expect(arg.telefoneHash).toEqual(expect.any(String));
      expect(arg.telefoneHash).toHaveLength(64);
    });

    it('sem telefone, grava nulo nos dois campos', async () => {
      const repo = makeRepo();
      const uc = new CriarUsuarioUseCase(repo, makeRoles());

      await uc.execute({ email: 'a@b.com', role: 'ADMIN' });

      const arg = (repo.criarUsuario as jest.Mock).mock.calls[0][0];
      expect(arg.telefone).toBeNull();
      expect(arg.telefoneHash).toBeNull();
      expect(repo.buscarPorTelefoneHash).not.toHaveBeenCalled();
    });

    it('procura duplicata em TODAS as formas equivalentes do numero', async () => {
      const repo = makeRepo();
      const uc = new CriarUsuarioUseCase(repo, makeRoles());

      await uc.execute({ email: 'a@b.com', role: 'ADMIN', telefone: '5585986467241' });

      // com e sem o nono digito, com e sem DDI: quatro consultas.
      expect((repo.buscarPorTelefoneHash as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(4);
      const hashes = (repo.buscarPorTelefoneHash as jest.Mock).mock.calls.map((c) => c[0]);
      expect(new Set(hashes).size).toBe(hashes.length); // sem repetir consulta
    });

    it('recusa o mesmo celular vindo em outro formato', async () => {
      // Ja existe alguem com 5585986467241; agora tentam 8586467241 — mesmo
      // aparelho, sem DDI e sem o nono digito.
      const repo = makeRepo({
        buscarPorTelefoneHash: jest
          .fn()
          .mockResolvedValue(
            new AdminUser('x', 'outro@b.com', null, null, null, new Date(), 'ADMIN', null),
          ),
      });
      const uc = new CriarUsuarioUseCase(repo, makeRoles());

      await expect(
        uc.execute({ email: 'a@b.com', role: 'ADMIN', telefone: '8586467241' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.criarUsuario).not.toHaveBeenCalled();
    });

    it('recusa numero curto demais para ser telefone', async () => {
      const repo = makeRepo();
      const uc = new CriarUsuarioUseCase(repo, makeRoles());

      await expect(
        uc.execute({ email: 'a@b.com', role: 'ADMIN', telefone: '98646' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
  it('rejeita e-mail ja existente', async () => {
    const repo = makeRepo({
      findByEmail: jest.fn().mockResolvedValue(
        new AdminUser('x', 'a@b.com', 'h', null, null, new Date(), 'ADMIN', null),
      ),
    });
    const uc = new CriarUsuarioUseCase(repo, makeRoles());
    await expect(uc.execute({ email: 'a@b.com', role: 'ADMIN' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
