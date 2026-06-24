import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PermissionsService } from '../../auth/application/permissions.service';
import { VENDA_REPOSITORY } from '../domain/ports/injection-tokens';
import type { IVendaRepository } from '../domain/ports/repositories/venda-repository.port';

/**
 * Isolamento de dados por vendedora (RF-USU-02). Decide, a partir do usuario
 * autenticado, se ele pode ver TODAS as vendas (permissao vendas:read_all —
 * gestao) ou se esta restrito as vendas da PROPRIA vendedora.
 */
@Injectable()
export class EscopoVendasService {
  constructor(
    private readonly permissions: PermissionsService,
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  /**
   * Retorna o vendedoraId ao qual o usuario esta restrito, ou `undefined`
   * quando ele pode ver a carteira inteira (vendas:read_all). Lanca 403 quando
   * o usuario NAO tem vendas:read_all e tambem nao esta vinculado a uma
   * vendedora — nesse caso nao ha carteira "propria" a exibir.
   */
  async vendedoraIdRestrito(user: {
    sub: string;
    role: string;
  }): Promise<string | undefined> {
    if (await this.permissions.possui(user.role, 'vendas:read_all')) {
      return undefined;
    }
    const vendedoraId = await this.vendaRepo.resolverVendedoraIdPorAdminUser(
      user.sub,
    );
    if (!vendedoraId) {
      throw new ForbiddenException(
        'Usuário não está vinculado a uma vendedora; acesso às vendas negado.',
      );
    }
    return vendedoraId;
  }
}
