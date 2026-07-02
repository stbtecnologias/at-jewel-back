import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StatusDemanda } from '../../domain/entities/enums';
import { DEMANDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  AtualizarDemandaData,
  DemandaItem,
  IDemandaRepository,
} from '../../domain/ports/repositories/demanda-repository.port';

export interface AtualizarDemandaInput {
  status?: StatusDemanda;
  resposta?: string | null;
}

@Injectable()
export class AtualizarDemandaUseCase {
  constructor(
    @Inject(DEMANDA_REPOSITORY)
    private readonly repo: IDemandaRepository,
  ) {}

  async execute(id: string, input: AtualizarDemandaInput): Promise<DemandaItem> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException('Demanda nao encontrada');

    const dados: AtualizarDemandaData = {};
    if (input.status !== undefined) dados.status = input.status;
    if (input.resposta !== undefined) dados.resposta = input.resposta;

    // Ao mudar para CONCLUIDA sem concluida_em previa, carimba now().
    // Nao sobrescreve um carimbo ja existente (idempotente em reenvio).
    if (input.status === 'CONCLUIDA' && !existente.concluidaEm) {
      dados.concluidaEm = new Date();
    }

    return this.repo.atualizar(id, dados);
  }
}
