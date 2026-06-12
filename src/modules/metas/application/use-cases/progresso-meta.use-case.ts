import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Meta } from '../../domain/entities/meta.entity';
import { META_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMetaRepository } from '../../domain/ports/repositories/meta-repository.port';

export interface ProgressoMeta {
  meta: Meta;
  realizado: number;
  percentual: number; // 0..100+ (2 casas)
  restante: number;
}

@Injectable()
export class ProgressoMetaUseCase {
  constructor(
    @Inject(META_REPOSITORY)
    private readonly repo: IMetaRepository,
  ) {}

  async execute(id: string): Promise<ProgressoMeta> {
    const meta = await this.repo.buscarPorId(id);
    if (!meta) throw new NotFoundException('Meta nao encontrada');

    const realizado = await this.repo.calcularRealizado(meta);
    const alvo = meta.valorAlvo;
    const percentual = alvo > 0 ? Math.round((realizado / alvo) * 10000) / 100 : 0;
    const restante = Math.max(0, alvo - realizado);

    return { meta, realizado, percentual, restante };
  }
}
