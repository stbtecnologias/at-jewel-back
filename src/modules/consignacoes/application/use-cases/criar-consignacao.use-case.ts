import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Consignacao } from '../../domain/entities/consignacao.entity';
import type { DestinoConsignacao } from '../../domain/entities/enums';
import { CONSIGNACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IConsignacaoRepository } from '../../domain/ports/repositories/consignacao-repository.port';

export interface CriarConsignacaoInput {
  produtoId: string;
  quantidade: number;
  destinoTipo: DestinoConsignacao;
  clienteId?: string | null;
  vendedoraId?: string | null;
  dataPrevistaRetorno?: Date | null;
  observacao?: string | null;
  criadoPor?: string | null;
}

@Injectable()
export class CriarConsignacaoUseCase {
  constructor(
    @Inject(CONSIGNACAO_REPOSITORY)
    private readonly repo: IConsignacaoRepository,
  ) {}

  async execute(input: CriarConsignacaoInput): Promise<Consignacao> {
    // A coerencia destino <-> detentor e uma regra de negocio
    // cross-field (nao expressavel em class-validator simples).
    // Convertemos a violacao da invariante de dominio em 400.
    let consignacao: Consignacao;
    try {
      consignacao = Consignacao.create({
        produtoId: input.produtoId,
        quantidade: input.quantidade,
        destinoTipo: input.destinoTipo,
        clienteId: input.clienteId ?? null,
        vendedoraId: input.vendedoraId ?? null,
        status: 'ABERTA',
        dataPrevistaRetorno: input.dataPrevistaRetorno ?? null,
        observacao: input.observacao ?? null,
        criadoPor: input.criadoPor ?? null,
      });
    } catch (erro) {
      throw new BadRequestException((erro as Error).message);
    }
    return this.repo.criar(consignacao);
  }
}
