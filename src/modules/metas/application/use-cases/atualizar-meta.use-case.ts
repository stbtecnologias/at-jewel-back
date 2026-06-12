import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Meta } from '../../domain/entities/meta.entity';
import { META_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  AtualizarMetaData,
  IMetaRepository,
} from '../../domain/ports/repositories/meta-repository.port';

@Injectable()
export class AtualizarMetaUseCase {
  constructor(
    @Inject(META_REPOSITORY)
    private readonly repo: IMetaRepository,
  ) {}

  async execute(id: string, dados: AtualizarMetaData): Promise<Meta> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException('Meta nao encontrada');
    return this.repo.atualizar(id, dados);
  }
}
