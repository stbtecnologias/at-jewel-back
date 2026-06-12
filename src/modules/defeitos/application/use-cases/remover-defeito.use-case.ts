import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IDefeitoRepository } from '../../domain/ports/repositories/defeito-repository.port';

@Injectable()
export class RemoverDefeitoUseCase {
  constructor(
    @Inject(DEFEITO_REPOSITORY)
    private readonly repo: IDefeitoRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException('Ocorrencia nao encontrada');
    await this.repo.remover(id);
  }
}
