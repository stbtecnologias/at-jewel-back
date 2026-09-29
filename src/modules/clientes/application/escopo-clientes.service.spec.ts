import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PermissionsService } from '../../auth/application/permissions.service';
import { CLIENTE_REPOSITORY } from '../domain/ports/injection-tokens';
import { EscopoClientesService } from './escopo-clientes.service';

const GESTAO = { sub: 'u-1', role: 'GERENTE' };
const VENDEDORA = { sub: 'u-2', role: 'VENDEDORA' };

async function montar(
  permissions: Record<string, jest.Mock>,
  repo: Record<string, jest.Mock>,
) {
  const mod = await Test.createTestingModule({
    providers: [
      EscopoClientesService,
      { provide: PermissionsService, useValue: permissions },
      { provide: CLIENTE_REPOSITORY, useValue: repo },
    ],
  }).compile();
  return mod.get(EscopoClientesService);
}

describe('EscopoClientesService — o recorte que o MEL-23 pede', () => {
  let permissions: Record<string, jest.Mock>;
  let repo: Record<string, jest.Mock>;

  beforeEach(() => {
    permissions = { possui: jest.fn().mockResolvedValue(false) };
    repo = {
      resolverVendedoraCodigoErpPorAdminUser: jest.fn().mockResolvedValue('VD01'),
    };
  });

  it('quem tem clientes:read_all vê a carteira inteira', async () => {
    permissions.possui.mockResolvedValue(true);
    const svc = await montar(permissions, repo);

    await expect(svc.codigoErpRestrito(GESTAO)).resolves.toBeUndefined();
    // Nem chega a procurar a vendedora: não há restrição a resolver.
    expect(repo.resolverVendedoraCodigoErpPorAdminUser).not.toHaveBeenCalled();
  });

  it('SEM read_all, fica restrita à própria vendedora', async () => {
    const svc = await montar(permissions, repo);

    await expect(svc.codigoErpRestrito(VENDEDORA)).resolves.toBe('VD01');
  });

  it('NEGA quem não tem read_all e não está vinculada a vendedora', async () => {
    // É o papel novo que alguém criou com `clientes:read` marcada e mais nada.
    // Não existe "carteira própria" para mostrar, e devolver a base inteira
    // seria exatamente o buraco que este serviço fecha.
    repo.resolverVendedoraCodigoErpPorAdminUser.mockResolvedValue(null);
    const svc = await montar(permissions, repo);

    await expect(svc.codigoErpRestrito(VENDEDORA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('podeVer', () => {
    it('sem restrição, vê qualquer cliente — inclusive o sem carteira', async () => {
      const svc = await montar(permissions, repo);

      expect(svc.podeVer(undefined, 'VD09')).toBe(true);
      expect(svc.podeVer(undefined, null)).toBe(true);
    });

    it('restrita, vê só o da própria carteira', async () => {
      const svc = await montar(permissions, repo);

      expect(svc.podeVer('VD01', 'VD01')).toBe(true);
      expect(svc.podeVer('VD01', 'VD02')).toBe(false);
    });

    it('CLIENTE SEM VENDEDORA NÃO É DE TODO MUNDO', async () => {
      // 198 dos 201 clientes locais não têm `vendedora_codigo_erp`. Tratar
      // ausência como "livre" devolveria quase a base inteira a qualquer
      // vendedora — o oposto do que este serviço existe para fazer.
      const svc = await montar(permissions, repo);

      expect(svc.podeVer('VD01', null)).toBe(false);
    });
  });

  /**
   * QUEM VE O CONTATO SEM MASCARA — requisito RF-10, 28/09/2026.
   *
   * ========================================================================
   * A MATRIZ TEM TRES LINHAS E A REGRA TEM DUAS CONDICOES.
   *
   *   Vendedora  -> sem mascara, "apenas dos proprios clientes"
   *   Gerente    -> mascarado
   *   Equipe AT  -> sem mascara
   *
   * A primeira e a terceira saem da MESMA pergunta: quem esta restrito a uma
   * carteira so ve os proprios clientes, entao "sem mascara nos proprios" e
   * "sem mascara" sao a mesma coisa para ela. Quem enxerga a base inteira ve
   * mascarado, a nao ser que tenha `clientes:contato`.
   *
   * Estes testes existem para que a regra continue DERIVADA do escopo. Se
   * alguem escrever uma terceira condicao — por papel, por nome —, ela
   * divergira do isolamento da carteira na primeira correcao feita de um lado
   * so, e a mascara passara a discordar de quem ve o que.
   * ========================================================================
   */
  describe('mascararContato', () => {
    it('vendedora restrita a propria carteira NAO recebe mascara', async () => {
      // Os clientes da resposta dela sao dela: nao ha outros para esconder.
      permissions.possui.mockResolvedValue(false);
      const svc = await montar(permissions, repo);

      expect(await svc.mascararContato(VENDEDORA, 'VD01')).toBe(false);
    });

    it('nem consulta a permissao quando ja esta restrita', async () => {
      permissions.possui.mockResolvedValue(false);
      const svc = await montar(permissions, repo);

      await svc.mascararContato(VENDEDORA, 'VD01');

      expect(permissions.possui).not.toHaveBeenCalled();
    });

    it('quem ve a base inteira SEM `clientes:contato` recebe mascara', async () => {
      // O caso da gerente: `clientes:read_all` sim, contato nao.
      permissions.possui.mockResolvedValue(false);
      const svc = await montar(permissions, repo);

      expect(await svc.mascararContato(GESTAO, undefined)).toBe(true);
      expect(permissions.possui).toHaveBeenCalledWith(
        'GERENTE',
        'clientes:contato',
      );
    });

    it('quem ve a base inteira COM `clientes:contato` nao recebe mascara', async () => {
      // O caso da Equipe AT.
      permissions.possui.mockResolvedValue(true);
      const svc = await montar(permissions, repo);

      expect(await svc.mascararContato(GESTAO, undefined)).toBe(false);
    });
  });
});
