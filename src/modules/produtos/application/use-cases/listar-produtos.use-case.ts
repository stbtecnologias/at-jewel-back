import { Inject, Injectable } from '@nestjs/common';
import { Produto } from '../../../erp/domain/entities/produto.entity';
import {
  PRODUTO_FOTO_REPOSITORY,
  PRODUTO_REPOSITORY,
} from '../../../erp/domain/ports/injection-tokens';
import type {
  FiltroProduto,
  IProdutoRepository,
} from '../../../erp/domain/ports/repositories/produto-repository.port';
import type { IProdutoFotoRepository } from '../../../erp/domain/ports/repositories/produto-foto-repository.port';

@Injectable()
export class ListarProdutosUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepository: IProdutoRepository,
    @Inject(PRODUTO_FOTO_REPOSITORY)
    private readonly fotos: IProdutoFotoRepository,
  ) {}

  /**
   * A LISTA JA SAI COM A CAPA — RF33, 20/10/2026.
   *
   * A capa entra em `fotoArquivoId`, que e o campo que todo consumidor ja le
   * como "a foto NOSSA": o painel, o canal da vendedora, o catalogo. Escrever
   * nele em vez de criar um campo novo e o que faz a foto aparecer nos tres no
   * mesmo commit — e e a mesma precedencia de sempre, so que agora a nossa vem
   * de `produto_fotos` em vez da coluna unica.
   *
   * UMA consulta para a pagina inteira (`capasDe`), e nao uma por peca: a
   * lista chega a 250 linhas no filtro por foto, e N+1 ali custaria a resposta.
   */
  async execute(filtros: FiltroProduto): Promise<Produto[]> {
    const produtos = await this.produtoRepository.findAll(filtros);
    if (produtos.length === 0) return produtos;

    const ids = produtos.map((p) => p.id).filter((id): id is string => !!id);
    const capas = await this.fotos.capasDe(ids);
    if (capas.size === 0) return produtos;

    // A PECA E IMUTAVEL — `Produto` tem construtor privado e campos `readonly`,
    // entao nao se escreve por cima: recria-se a que tem capa. So essa, para a
    // lista sem foto nossa nao pagar nada.
    return produtos.map((p) => {
      const capa = p.id ? capas.get(p.id) : undefined;
      return capa ? Produto.create({ ...p, fotoArquivoId: capa }) : p;
    });
  }

  /** Quantas existem com esse filtro, ignorando o teto da lista. */
  async contar(filtros: FiltroProduto): Promise<number> {
    return this.produtoRepository.contar(filtros);
  }

  /**
   * Os tipos de peca que existem no catalogo — 28/09/2026.
   *
   * Serve a agente conferir a familia ANTES de consultar: o modelo escreve o
   * que a pessoa falou ("bracelete"), e o catalogo tem outra palavra
   * ("PULSEIRA"). Sem a conferencia, a consulta devolveria zero linhas — e
   * zero e indistinguivel de "ninguem vendeu isso no periodo".
   *
   * Sai das FACETAS, que ja calculam isto para os filtros da tela: uma
   * consulta propria de "quais familias existem" divergiria da primeira no dia
   * em que alguem mudasse o criterio de uma delas.
   */
  async familias(): Promise<string[]> {
    return (await this.produtoRepository.facetas()).familias;
  }
}
