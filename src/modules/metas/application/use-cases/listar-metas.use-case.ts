import { Inject, Injectable } from '@nestjs/common';
import { Meta } from '../../domain/entities/meta.entity';
import { META_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroMeta,
  IMetaRepository,
} from '../../domain/ports/repositories/meta-repository.port';

@Injectable()
export class ListarMetasUseCase {
  constructor(
    @Inject(META_REPOSITORY)
    private readonly repo: IMetaRepository,
  ) {}

  async execute(filtro: FiltroMeta): Promise<Meta[]> {
    return this.repo.listar(filtro);
  }
}
