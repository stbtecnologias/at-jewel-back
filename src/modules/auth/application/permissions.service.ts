import { Inject, Injectable } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../domain/ports/injection-tokens';
import type { IRoleRepository } from '../domain/ports/repositories/role-repository.port';
import { PERMISSAO_CHAVES, PERMISSAO_TODAS } from '../domain/permissions';

/**
 * Resolve as permissoes de um papel a partir da tabela `roles`/`role_permissions`,
 * com cache em memoria (invalidar apos mutacoes de papel). Evita um hit no banco
 * a cada request protegido. Instancia unica (1 container) — sem coerencia
 * distribuida necessaria.
 */
@Injectable()
export class PermissionsService {
  private cache: Map<string, Set<string>> | null = null;

  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  invalidar(): void {
    this.cache = null;
  }

  private async garantirCache(): Promise<Map<string, Set<string>>> {
    if (!this.cache) {
      const roles = await this.repo.listar();
      this.cache = new Map(roles.map((r) => [r.chave, new Set(r.permissoes)]));
    }
    return this.cache;
  }

  /** true se o papel possui a permissao (ou o curinga '*'). */
  async possui(role: string, permissao: string): Promise<boolean> {
    const cache = await this.garantirCache();
    const set = cache.get(role);
    if (!set) return false;
    return set.has(PERMISSAO_TODAS) || set.has(permissao);
  }

  /** Lista expandida de permissoes do papel ('*' vira o catalogo inteiro). */
  async permissoesDe(role: string): Promise<string[]> {
    const cache = await this.garantirCache();
    const set = cache.get(role);
    if (!set) return [];
    if (set.has(PERMISSAO_TODAS)) return [...PERMISSAO_CHAVES];
    return [...set];
  }
}
