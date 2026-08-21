import { Injectable } from '@nestjs/common';
import { ListarProdutosUseCase } from '../../../produtos/application/use-cases/listar-produtos.use-case';

/** Teto de resultados. Lista longa nao ajuda ninguem numa conversa de WhatsApp. */
const MAXIMO = 6;

/**
 * O que a vendedora ve de um produto.
 *
 * REPARE NO QUE NAO EXISTE AQUI: `valorCusto` e `margemPercentual`. Nao e
 * omissao do prompt — e ausencia de campo. A decisao (Lucas, 20/08/2026) foi
 * que ela ve PRECO DE VENDA e quantidade; custo e margem sao informacao de
 * gestao. Como o objeto nao carrega, nenhuma instrucao no meio da conversa faz
 * o modelo revelar o que ele nunca recebeu.
 */
export interface ProdutoParaVendedora {
  descricao: string;
  categoria: string;
  familia: string;
  codigo: string | null;
  precoVenda: number;
  emEstoque: number;
}

/**
 * Consulta de catalogo pela vendedora, no canal interno.
 *
 * Esta e a unica ferramenta do canal que NAO e restrita a ela: catalogo e da
 * loja, nao da carteira. O escopo aqui nao e por pessoa, e por CAMPO — o que
 * sai do banco e maior do que o que sai deste use case.
 */
@Injectable()
export class ConsultarProdutosVendedoraUseCase {
  constructor(private readonly listar: ListarProdutosUseCase) {}

  async execute(busca: string): Promise<ProdutoParaVendedora[]> {
    const produtos = await this.listar.execute({
      busca,
      ativo: true,
      limit: MAXIMO,
    });

    return produtos.map((p) => ({
      descricao: p.descricaoEtiqueta ?? `${p.categoria} ${p.familia}`,
      categoria: p.categoria,
      familia: p.familia,
      codigo: p.codigoErp,
      precoVenda: p.valorVenda,
      emEstoque: p.estoqueAtual,
    }));
  }
}
