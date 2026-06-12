import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Meta } from '../../domain/entities/meta.entity';
import { META_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMetaRepository } from '../../domain/ports/repositories/meta-repository.port';

@Injectable()
export class BuscarMetaUseCase {
  constructor(
    @Inject(META_REPOSITORY)
    private readonly repo: IMetaRepository,
  ) {}

  async execute(id: string): Promise<Meta> {
    const meta = await this.repo.buscarPorId(id);
    if (!meta) throw new NotFoundException('Meta nao encontrada');
    return meta;
  }
}
