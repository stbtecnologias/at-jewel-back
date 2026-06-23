import { Inject, Injectable } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IRoleRepository,
  RoleComPermissoes,
} from '../../domain/ports/repositories/role-repository.port';

@Injectable()
export class ListarRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  execute(): Promise<RoleComPermissoes[]> {
    return this.repo.listar();
  }
}
