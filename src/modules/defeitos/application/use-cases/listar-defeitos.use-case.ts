import { Inject, Injectable } from '@nestjs/common';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroDefeito,
  IDefeitoRepository,
} from '../../domain/ports/repositories/defeito-repository.port';

@Injectable()
export class ListarDefeitosUseCase {
  constructor(
    @Inject(DEFEITO_REPOSITORY)
    private readonly repo: IDefeitoRepository,
  ) {}

  async execute(filtro: FiltroDefeito) {
    const { data, total } = await this.repo.listar(filtro);
    return {
      data,
      meta: {
        total,
        page: filtro.page,
        limit: filtro.limit,
        totalPages: Math.ceil(total / filtro.limit),
      },
    };
  }
}
