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
});
