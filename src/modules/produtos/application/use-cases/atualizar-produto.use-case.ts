import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Produto } from '../../../erp/domain/entities/produto.entity';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';

export interface AtualizarProdutoInput {
  categoria?: string;
  familia?: string;
  colecao?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  tipoPedra?: string | null;
  colecaoPedra?: string | null;
  referenciaFornecedor?: string | null;
  descricaoEtiqueta?: string | null;
  pesoGramas?: number | null;
  unidade?: string;
  valorCompra?: number | null;
  valorCusto?: number | null;
  margemPercentual?: number | null;
  valorVenda?: number;
  observacao?: string | null;
  fotoUrl?: string | null;
  ativo?: boolean;
}

@Injectable()
export class AtualizarProdutoUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
  ) {}

  async execute(id: string, input: AtualizarProdutoInput): Promise<Produto> {
    const existente = await this.produtoRepository.findById(id);
    if (!existente) throw new NotFoundException(`Produto ${id} não encontrado`);

    const atualizado = Produto.create({
      id: existente.id,
      codigoErp: existente.codigoErp,
      categoria: input.categoria !== undefined ? input.categoria : existente.categoria,
      familia: input.familia !== undefined ? input.familia : existente.familia,
      colecao: input.colecao !== undefined ? input.colecao : existente.colecao,
      cor: input.cor !== undefined ? input.cor : existente.cor,
      tamanho: input.tamanho !== undefined ? input.tamanho : existente.tamanho,
      tipoPedra: input.tipoPedra !== undefined ? input.tipoPedra : existente.tipoPedra,
      colecaoPedra: input.colecaoPedra !== undefined ? input.colecaoPedra : existente.colecaoPedra,
      referenciaFornecedor: input.referenciaFornecedor !== undefined ? input.referenciaFornecedor : existente.referenciaFornecedor,
      descricaoEtiqueta: input.descricaoEtiqueta !== undefined ? input.descricaoEtiqueta : existente.descricaoEtiqueta,
      pesoGramas: input.pesoGramas !== undefined ? input.pesoGramas : existente.pesoGramas,
      unidade: input.unidade !== undefined ? input.unidade : existente.unidade,
      valorCompra: input.valorCompra !== undefined ? input.valorCompra : existente.valorCompra,
      valorCusto: input.valorCusto !== undefined ? input.valorCusto : existente.valorCusto,
      margemPercentual: input.margemPercentual !== undefined ? input.margemPercentual : existente.margemPercentual,
      valorVenda: input.valorVenda !== undefined ? input.valorVenda : existente.valorVenda,
      observacao: input.observacao !== undefined ? input.observacao : existente.observacao,
      fotoUrl: input.fotoUrl !== undefined ? input.fotoUrl : existente.fotoUrl,
      ativo: input.ativo !== undefined ? input.ativo : existente.ativo,
    });

    return this.produtoRepository.save(atualizado);
  }
}
