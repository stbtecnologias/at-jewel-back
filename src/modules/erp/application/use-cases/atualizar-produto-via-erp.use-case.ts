import { Inject, Injectable } from '@nestjs/common';
import { Produto } from '../../domain/entities/produto.entity';
import {
  ERP_EVENTO_REPOSITORY,
  PRODUTO_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IErpEventoRepository } from '../../domain/ports/repositories/erp-evento-repository.port';
import type { IProdutoRepository } from '../../domain/ports/repositories/produto-repository.port';

export interface AtualizarProdutoViaErpInput {
  eventoId: string;
  codigoErp: string;
  categoria: string;
  familia: string;
  colecao?: string;
  cor?: string;
  tamanho?: string;
  tipoPedra?: string;
  colecaoPedra?: string;
  referenciaFornecedor?: string;
  descricaoEtiqueta?: string;
  pesoGramas?: number;
  unidade: string;
  valorCompra?: number;
  valorCusto?: number;
  margemPercentual?: number;
  valorVenda: number;
  observacao?: string;
  fotoUrl?: string;
}

export interface AtualizarProdutoViaErpOutput {
  idempotente: boolean;
  produto?: Produto;
}

@Injectable()
export class AtualizarProdutoViaErpUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
    @Inject(ERP_EVENTO_REPOSITORY)
    private readonly eventoRepository: IErpEventoRepository,
  ) {}

  async execute(
    input: AtualizarProdutoViaErpInput,
  ): Promise<AtualizarProdutoViaErpOutput> {
    const jaProcessado = await this.eventoRepository.jaProcessado(
      input.eventoId,
    );
    if (jaProcessado) {
      return { idempotente: true };
    }

    const produto = Produto.create({
      codigoErp: input.codigoErp,
      categoria: input.categoria,
      familia: input.familia,
      colecao: input.colecao,
      cor: input.cor,
      tamanho: input.tamanho,
      tipoPedra: input.tipoPedra,
      colecaoPedra: input.colecaoPedra,
      referenciaFornecedor: input.referenciaFornecedor,
      descricaoEtiqueta: input.descricaoEtiqueta,
      pesoGramas: input.pesoGramas,
      unidade: input.unidade,
      valorCompra: input.valorCompra,
      valorCusto: input.valorCusto,
      margemPercentual: input.margemPercentual,
      valorVenda: input.valorVenda,
      observacao: input.observacao,
      fotoUrl: input.fotoUrl,
      ativo: true,
    });

    const salvo = await this.produtoRepository.upsertByCodigoErp(produto);
    await this.eventoRepository.marcarComoProcessado(
      input.eventoId,
      'PRODUTO',
    );

    return { idempotente: false, produto: salvo };
  }
}
