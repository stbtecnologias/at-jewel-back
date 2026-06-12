import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Defeito } from '../../domain/entities/defeito.entity';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IDefeitoRepository } from '../../domain/ports/repositories/defeito-repository.port';

@Injectable()
export class BuscarDefeitoUseCase {
  constructor(
    @Inject(DEFEITO_REPOSITORY)
    private readonly repo: IDefeitoRepository,
  ) {}

  async execute(id: string): Promise<Defeito> {
    const defeito = await this.repo.buscarPorId(id);
    if (!defeito) throw new NotFoundException('Ocorrencia nao encontrada');
    return defeito;
  }
}
