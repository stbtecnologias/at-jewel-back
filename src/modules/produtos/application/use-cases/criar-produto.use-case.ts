import { Inject, Injectable } from '@nestjs/common';
import { Produto } from '../../../erp/domain/entities/produto.entity';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';

export interface CriarProdutoInput {
  codigoErp?: string | null;
  categoria: string;
  familia: string;
  colecao?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  tipoPedra?: string | null;
  colecaoPedra?: string | null;
  referenciaFornecedor?: string | null;
  descricaoEtiqueta?: string | null;
  pesoGramas?: number | null;
  unidade: string;
  valorCompra?: number | null;
  valorCusto?: number | null;
  margemPercentual?: number | null;
  valorVenda: number;
  observacao?: string | null;
  fotoUrl?: string | null;
  estoqueAtual?: number | null;
  dataEntradaEstoque?: Date | null;
}

@Injectable()
export class CriarProdutoUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
  ) {}

  async execute(input: CriarProdutoInput): Promise<Produto> {
    const produto = Produto.create({ ...input, codigoErp: input.codigoErp ?? null, ativo: true });
    return this.produtoRepository.save(produto);
  }
}
