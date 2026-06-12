import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Defeito } from '../../domain/entities/defeito.entity';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  AtualizarDefeitoData,
  IDefeitoRepository,
} from '../../domain/ports/repositories/defeito-repository.port';

@Injectable()
export class AtualizarDefeitoUseCase {
  constructor(
    @Inject(DEFEITO_REPOSITORY)
    private readonly repo: IDefeitoRepository,
  ) {}

  async execute(id: string, dados: AtualizarDefeitoData): Promise<Defeito> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException('Ocorrencia nao encontrada');
    return this.repo.atualizar(id, dados);
  }
}
