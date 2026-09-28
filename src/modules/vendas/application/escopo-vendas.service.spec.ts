import { ForbiddenException } from '@nestjs/common';
import { PermissionsService } from '../../auth/application/permissions.service';
import type { IVendaRepository } from '../domain/ports/repositories/venda-repository.port';
import { EscopoVendasService } from './escopo-vendas.service';

describe('EscopoVendasService (RF-USU-02)', () => {
  let permissions: jest.Mocked<PermissionsService>;
  let vendaRepo: jest.Mocked<IVendaRepository>;
  let service: EscopoVendasService;

  beforeEach(() => {
    permissions = {
      possui: jest.fn(),
    } as unknown as jest.Mocked<PermissionsService>;
    vendaRepo = {
      resolverVendedoraIdPorAdminUser: jest.fn(),
      // Padrao "sem equipe": e o estado de todo mundo hoje, e o que faz os
      // testes antigos continuarem descrevendo a regra antiga.
      vendedorasDaEquipeDoUsuario: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IVendaRepository>;
    service = new EscopoVendasService(permissions, vendaRepo);
  });

  it('nao restringe quem tem vendas:read_all (gestao ve tudo)', async () => {
    permissions.possui.mockResolvedValue(true);

    const restrito = await service.vendedoraIdRestrito({ sub: 'u1', role: 'GERENTE' });

    expect(restrito).toBeUndefined();
    expect(vendaRepo.resolverVendedoraIdPorAdminUser).not.toHaveBeenCalled();
  });

  it('restringe a vendedora vinculada quando so tem vendas:read', async () => {
    permissions.possui.mockResolvedValue(false);
    vendaRepo.resolverVendedoraIdPorAdminUser.mockResolvedValue('vend-123');

    const restrito = await service.vendedoraIdRestrito({ sub: 'u2', role: 'VENDEDORA' });

    expect(restrito).toBe('vend-123');
    expect(vendaRepo.resolverVendedoraIdPorAdminUser).toHaveBeenCalledWith('u2');
  });

  it('nega acesso (403) quando o usuario nao tem read_all nem vendedora vinculada', async () => {
    permissions.possui.mockResolvedValue(false);
    vendaRepo.resolverVendedoraIdPorAdminUser.mockResolvedValue(null);

    await expect(
      service.vendedoraIdRestrito({ sub: 'u3', role: 'MARKETING' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * O RECORTE COMPLETO — os tres estados (RF-06, RF-08, 28/09/2026).
   *
   * ========================================================================
   * O TESTE QUE MAIS IMPORTA AQUI E O DA ORDEM DAS PERGUNTAS.
   *
   * A gerente TEM `vendas:read_all` — e o que a deixa ver mais de uma
   * vendedora. Se a permissao fosse consultada antes da equipe, ela cairia em
   * "a loja inteira" e o recorte nunca seria aplicado: ela veria numeros
   * maiores, plausiveis, e nada acusaria o erro.
   *
   * `equipe antes da permissao` e o nome desse teste, e ele e a regra.
   * ========================================================================
   */
  describe('recorteDeVendas', () => {
    const GERENTE = { sub: 'u-ger', role: 'GERENTE_VENDAS' };

    it('a EQUIPE vem antes da permissao — mesmo com vendas:read_all', async () => {
      permissions.possui.mockResolvedValue(true);
      vendaRepo.vendedorasDaEquipeDoUsuario.mockResolvedValue(['v1', 'v2']);

      expect(await service.recorteDeVendas(GERENTE)).toEqual(['v1', 'v2']);
      // Nem chega a perguntar: a equipe ja respondeu.
      expect(permissions.possui).not.toHaveBeenCalled();
    });

    it('equipe VAZIA recorta para nada — nao vira "a loja inteira"', async () => {
      // Uma equipe recem-criada, antes de as vendedoras serem vinculadas. Se
      // `[]` virasse `undefined`, a gerente veria a loja no dia do cadastro.
      permissions.possui.mockResolvedValue(true);
      vendaRepo.vendedorasDaEquipeDoUsuario.mockResolvedValue([]);

      expect(await service.recorteDeVendas(GERENTE)).toEqual([]);
    });

    it('sem equipe e com read_all, ve a loja — o caso da Equipe AT', async () => {
      permissions.possui.mockResolvedValue(true);
      vendaRepo.vendedorasDaEquipeDoUsuario.mockResolvedValue(null);

      expect(await service.recorteDeVendas({ sub: 'u1', role: 'ADMIN' })).toBeUndefined();
    });

    it('sem equipe e sem read_all, ve a propria carteira — como lista', async () => {
      permissions.possui.mockResolvedValue(false);
      vendaRepo.vendedorasDaEquipeDoUsuario.mockResolvedValue(null);
      vendaRepo.resolverVendedoraIdPorAdminUser.mockResolvedValue('vend-123');

      expect(
        await service.recorteDeVendas({ sub: 'u2', role: 'VENDEDORA' }),
      ).toEqual(['vend-123']);
    });

    it('sem equipe, sem read_all e sem vendedora: 403, como antes', async () => {
      permissions.possui.mockResolvedValue(false);
      vendaRepo.vendedorasDaEquipeDoUsuario.mockResolvedValue(null);
      vendaRepo.resolverVendedoraIdPorAdminUser.mockResolvedValue(null);

      await expect(
        service.recorteDeVendas({ sub: 'u3', role: 'MARKETING' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
