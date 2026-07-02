import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CONSIGNACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ConsignacaoItem,
  IConsignacaoRepository,
} from '../../domain/ports/repositories/consignacao-repository.port';

@Injectable()
export class BuscarConsignacaoUseCase {
  constructor(
    @Inject(CONSIGNACAO_REPOSITORY)
    private readonly repo: IConsignacaoRepository,
  ) {}

  async execute(id: string): Promise<ConsignacaoItem> {
    const item = await this.repo.buscarItemPorId(id);
    if (!item) throw new NotFoundException('Consignacao nao encontrada');
    return item;
  }
}
