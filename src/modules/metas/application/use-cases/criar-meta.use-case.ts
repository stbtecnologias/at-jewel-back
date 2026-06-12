import { Inject, Injectable } from '@nestjs/common';
import { Meta } from '../../domain/entities/meta.entity';
import type { TipoMeta } from '../../domain/entities/enums';
import { META_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMetaRepository } from '../../domain/ports/repositories/meta-repository.port';

export interface CriarMetaInput {
  tipo: TipoMeta;
  referenciaId?: string | null;
  valorAlvo: number;
  prazo: Date;
  descricao?: string | null;
}

@Injectable()
export class CriarMetaUseCase {
  constructor(
    @Inject(META_REPOSITORY)
    private readonly repo: IMetaRepository,
  ) {}

  async execute(input: CriarMetaInput): Promise<Meta> {
    const meta = Meta.create(input);
    return this.repo.criar(meta);
  }
}
