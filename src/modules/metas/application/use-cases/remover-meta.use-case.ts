import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { META_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMetaRepository } from '../../domain/ports/repositories/meta-repository.port';

@Injectable()
export class RemoverMetaUseCase {
  constructor(
    @Inject(META_REPOSITORY)
    private readonly repo: IMetaRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException('Meta nao encontrada');
    await this.repo.remover(id);
  }
}
