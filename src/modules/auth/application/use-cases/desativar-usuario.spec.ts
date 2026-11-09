import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AtualizarUsuarioUseCase } from './atualizar-usuario.use-case';
import { LoginAdminUseCase } from './login-admin.use-case';
import { RefreshTokenUseCase } from './refresh-token.use-case';
import {
  BuscarAdminPorTelefoneUseCase,
  PERMISSAO_GESTAO,
} from './buscar-admin-por-telefone.use-case';
import { AdminUser } from '../../domain/entities/admin-user.entity';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

// `hashField` exige HASH_SECRET — mesmo padrao dos specs de cliente e
// vendedora. O valor nao importa, so tem de existir.
beforeAll(() => {
  process.env.HASH_SECRET ??= randomBytes(32).toString('hex');
});

/**
 * ==========================================================================
 * DESATIVAR USUARIO DO PAINEL — migracao 77, 09/11/2026.
 *
 * *"Em usuarios, nao tenho a possibilidade de desativar um usuario?"* Nao
 * tinha: `admin_users` nao tinha estado nenhum, e o unico caminho para fora
 * era o DELETE. E o DELETE leva o trabalho junto — a conclusao dele no mesmo
 * fio: *"e pq o delete, se o usuario tiver feito alguma coisa, ai some.. nao
 * parece muito bom"*.
 *
 * Medido antes de escrever: dos sete vinculos, seis caem para NULL e UM e
 * CASCADE — `lembretes`, 22 deles na base. Lembrete nao e registro do
 * passado, e compromisso FUTURO.
 *
 * O QUE O DESLIGADO PERDE, na frase dele:
 *
 *   *"O usuario desativado nao acessa o sistema, nao usa mais a Anastacia e
 *   Helena, e nao aparece em consulta."*
 *
 * A do meio e a que nao e obvia: as agentes reconhecem POR TELEFONE, e isso
 * nao passa pelo login.
 * ==========================================================================
 */

const SENHA = 'segredo-de-teste';

function usuario(over: Partial<AdminUser> = {}): AdminUser {
  return new AdminUser(
    over.id ?? 'adm-1',
    over.email ?? 'alguem@atjewel.com',
    over.passwordHash ?? bcrypt.hashSync(SENHA, 4),
    over.refreshTokenHash ?? null,
    over.refreshTokenExpiresAt ?? null,
    over.createdAt ?? new Date('2026-01-10T12:00:00Z'),
    over.role ?? 'ADMIN',
    over.nome ?? 'Alguém',
    over.telefone ?? '5585999990000',
    over.ativo ?? true,
  );
}

function repositorio(
  inicial: AdminUser,
): { repo: IAdminUserRepository; updateRefreshToken: jest.Mock; salvo: () => AdminUser } {
  let atual = inicial;
  const updateRefreshToken = jest.fn().mockResolvedValue(undefined);
  const repo = {
    findById: jest.fn().mockImplementation(() => Promise.resolve(atual)),
    findByEmail: jest.fn().mockImplementation(() => Promise.resolve(atual)),
    // Qualquer variante do telefone acha esta pessoa: o que se mede aqui e o
    // que o use case FAZ depois de achar, e nao a busca em si.
    buscarPorTelefoneHash: jest
      .fn()
      .mockImplementation(() => Promise.resolve(atual)),
    atualizarDados: jest.fn().mockImplementation((_id, dados) => {
      atual = usuario({ ...atual, ...dados } as Partial<AdminUser>);
      return Promise.resolve(atual);
    }),
    updateRefreshToken,
  } as unknown as IAdminUserRepository;
  return { repo, updateRefreshToken, salvo: () => atual };
}

describe('desativar usuário do painel', () => {
  // -------------------------------------------------------------------------
  // "não acessa o sistema"
  // -------------------------------------------------------------------------

  describe('o login', () => {
    /* ESTE É O TESTE. */
    it('a conta desligada não entra, mesmo com a senha certa', async () => {
      const { repo } = repositorio(usuario({ ativo: false }));
      const uc = new LoginAdminUseCase(repo, new JwtService({ secret: 't' }));

      await expect(uc.execute('alguem@atjewel.com', SENHA)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    /**
     * A FRASE É A DE SEMPRE, e isso é deliberado.
     *
     * "Conta desativada" contaria a quem está chutando senha que o e-mail
     * existe. E a recusa vem DEPOIS de conferir a senha, para o tempo de
     * resposta também não diferenciar os dois casos.
     */
    it('a recusa não revela que a conta existe', async () => {
      const { repo } = repositorio(usuario({ ativo: false }));
      const uc = new LoginAdminUseCase(repo, new JwtService({ secret: 't' }));

      await expect(uc.execute('alguem@atjewel.com', SENHA)).rejects.toThrow(
        'Credenciais inválidas',
      );
    });

    it('e a conta ligada entra como sempre entrou', async () => {
      const { repo } = repositorio(usuario({ ativo: true }));
      const uc = new LoginAdminUseCase(repo, new JwtService({ secret: 't' }));

      const r = await uc.execute('alguem@atjewel.com', SENHA);

      expect(r.accessToken).toBeTruthy();
    });
  });

  /**
   * ==========================================================================
   * A PORTA QUE IMPORTA — quem já estava dentro.
   *
   * Quem está com a aba aberta nunca mais passa pelo login: só renova. Sem
   * esta guarda, a conta desativada continuaria logada indefinidamente, e o
   * `ativo` não fecharia nada para quem já estava usando o sistema.
   * ==========================================================================
   */
  describe('a sessão já aberta', () => {
    const cru = 'adm-1.umtokenqualquer';

    function comSessao(ativo: boolean) {
      const hash = require('crypto')
        .createHash('sha256')
        .update(cru)
        .digest('hex') as string;
      return repositorio(
        usuario({
          ativo,
          refreshTokenHash: hash,
          refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
        }),
      );
    }

    it('não renova para quem foi desligado', async () => {
      const { repo } = comSessao(false);
      const uc = new RefreshTokenUseCase(repo, new JwtService({ secret: 't' }));

      await expect(uc.execute(cru)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('e a sessão MORRE — o refresh é zerado, não só recusado', async () => {
      const { repo, updateRefreshToken } = comSessao(false);
      const uc = new RefreshTokenUseCase(repo, new JwtService({ secret: 't' }));

      await expect(uc.execute(cru)).rejects.toThrow();

      expect(updateRefreshToken).toHaveBeenCalledWith('adm-1', null, null);
    });

    it('quem está ativo continua renovando', async () => {
      const { repo } = comSessao(true);
      const uc = new RefreshTokenUseCase(repo, new JwtService({ secret: 't' }));

      const r = await uc.execute(cru);

      expect(r.accessToken).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // "não usa mais a Anastácia e Helena"
  // -------------------------------------------------------------------------

  /**
   * ==========================================================================
   * UMA LINHA QUE FECHA AS TRÊS AGENTES.
   *
   * `BuscarAdminPorTelefone` é o funil único do canal interno — Elena, Helena
   * e Anastasia entram todas por aqui. É a regra de 29/09: "a guarda fica no
   * funil, e não em cada tradutor".
   *
   * E precisa existir porque o reconhecimento é POR TELEFONE: fechar só o
   * painel deixaria quem foi desligado vendo faturamento, carteira e
   * desempenho da equipe pelo WhatsApp, sem nunca mais digitar uma senha.
   * ==========================================================================
   */
  describe('as agentes no WhatsApp', () => {
    const permissoes = { possui: jest.fn().mockResolvedValue(true) } as never;

    it('o telefone do desligado NÃO é reconhecido', async () => {
      const { repo } = repositorio(usuario({ ativo: false }));
      const uc = new BuscarAdminPorTelefoneUseCase(repo, permissoes);

      const r = await uc.execute('5585999990000', PERMISSAO_GESTAO);

      expect(r).toBeNull();
    });

    it('e o telefone de quem está na casa continua sendo', async () => {
      const { repo } = repositorio(usuario({ ativo: true }));
      const uc = new BuscarAdminPorTelefoneUseCase(repo, permissoes);

      const r = await uc.execute('5585999990000', PERMISSAO_GESTAO);

      expect(r?.id).toBe('adm-1');
    });
  });

  // -------------------------------------------------------------------------
  // O PATCH
  // -------------------------------------------------------------------------

  describe('ligar e desligar', () => {
    it('desliga, e derruba a sessão aberta no mesmo ato', async () => {
      const { repo, updateRefreshToken, salvo } = repositorio(usuario());
      const uc = new AtualizarUsuarioUseCase(repo);

      const r = await uc.execute({
        id: 'adm-1',
        ativo: false,
        solicitanteId: 'outro-adm',
      });

      expect(r.ativo).toBe(false);
      expect(salvo().ativo).toBe(false);
      // SEM ISTO a pessoa seguiria navegando por até 8h (JWT_ACCESS_TTL).
      expect(updateRefreshToken).toHaveBeenCalledWith('adm-1', null, null);
    });

    /**
     * A MESMA TRAVA DO REMOVER, que já dizia "você não pode remover a própria
     * conta". É a mesma consequência por outro caminho: o último SUPERADMIN
     * se trancaria para fora, e o conserto seria UPDATE em produção.
     */
    it('ninguém desativa a própria conta', async () => {
      const { repo } = repositorio(usuario());
      const uc = new AtualizarUsuarioUseCase(repo);

      await expect(
        uc.execute({ id: 'adm-1', ativo: false, solicitanteId: 'adm-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mas reativar passa — e não derruba sessão nenhuma', async () => {
      const { repo, updateRefreshToken, salvo } = repositorio(
        usuario({ ativo: false }),
      );
      const uc = new AtualizarUsuarioUseCase(repo);

      await uc.execute({ id: 'adm-1', ativo: true, solicitanteId: 'outro' });

      expect(salvo().ativo).toBe(true);
      expect(updateRefreshToken).not.toHaveBeenCalled();
    });

    it('PATCH sem `ativo` não mexe no estado — campo ausente é campo ausente', async () => {
      const { repo, salvo } = repositorio(usuario({ ativo: false }));
      const uc = new AtualizarUsuarioUseCase(repo);

      await uc.execute({ id: 'adm-1', nome: 'Outro Nome' });

      expect(salvo().ativo).toBe(false);
    });

    /**
     * A EXCEÇÃO NECESSÁRIA do "não aparece em consulta": a tela de Usuários é
     * o único lugar de onde dá para REATIVAR alguém. Escondendo o desligado
     * ali, a desativação viraria irreversível pelo painel.
     */
    it('o estado SAI na visão pública, para a tela poder reativar', async () => {
      const { repo } = repositorio(usuario({ ativo: false }));
      const uc = new AtualizarUsuarioUseCase(repo);

      const r = await uc.execute({ id: 'adm-1', nome: 'Alguém' });

      expect(r.ativo).toBe(false);
    });
  });
});
