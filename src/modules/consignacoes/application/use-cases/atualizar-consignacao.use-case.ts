import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StatusConsignacao } from '../../domain/entities/enums';
import { STATUS_CONSIGNACAO_TERMINAIS } from '../../domain/entities/enums';
import { CONSIGNACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ConsignacaoItem,
  IConsignacaoRepository,
} from '../../domain/ports/repositories/consignacao-repository.port';

export interface AtualizarConsignacaoInput {
  status?: StatusConsignacao;
  dataRetorno?: Date | null;
  observacao?: string | null;
}

@Injectable()
export class AtualizarConsignacaoUseCase {
  constructor(
    @Inject(CONSIGNACAO_REPOSITORY)
    private readonly repo: IConsignacaoRepository,
  ) {}

  async execute(id: string, input: AtualizarConsignacaoInput): Promise<ConsignacaoItem> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException('Consignacao nao encontrada');

    const dados: AtualizarConsignacaoInput = {};
    if (input.status !== undefined) dados.status = input.status;
    if (input.dataRetorno !== undefined) dados.dataRetorno = input.dataRetorno;
    if (input.observacao !== undefined) dados.observacao = input.observacao;

    // Ao mudar para um estado terminal (DEVOLVIDA/VENDIDA) sem uma
    // data_retorno explicita, carimba now(). So preenche se ainda
    // nao havia data_retorno registrada e o caller nao mandou uma.
    const virandoTerminal =
      input.status !== undefined && STATUS_CONSIGNACAO_TERMINAIS.includes(input.status);
    if (virandoTerminal && input.dataRetorno === undefined && !existente.dataRetorno) {
      dados.dataRetorno = new Date();
    }

    return this.repo.atualizar(id, dados);
  }
}
