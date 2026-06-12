import { Inject, Injectable } from '@nestjs/common';
import { Defeito } from '../../domain/entities/defeito.entity';
import type { TipoDefeito } from '../../domain/entities/enums';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IDefeitoRepository } from '../../domain/ports/repositories/defeito-repository.port';

export interface CriarDefeitoInput {
  produtoId: string;
  tipo: TipoDefeito;
  descricao: string;
  data: Date;
  resolucao?: string | null;
}

@Injectable()
export class CriarDefeitoUseCase {
  constructor(
    @Inject(DEFEITO_REPOSITORY)
    private readonly repo: IDefeitoRepository,
  ) {}

  async execute(input: CriarDefeitoInput): Promise<Defeito> {
    const defeito = Defeito.create(input);
    return this.repo.criar(defeito);
  }
}
