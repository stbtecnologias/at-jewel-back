import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Produto } from '../../../../domain/entities/produto.entity';
import {
  AlertasEstoque,
  FacetasProduto,
  FiltroProduto,
  IProdutoRepository,
  ProdutoAlerta,
} from '../../../../domain/ports/repositories/produto-repository.port';
import { ProdutoOrmEntity } from '../entities/produto.orm-entity';

const NOME_PRODUTO = `COALESCE(NULLIF(descricao_etiqueta, ''), codigo_erp, categoria || ' ' || familia, LEFT(id::text, 8))`;

@Injectable()
export class ProdutoRepository implements IProdutoRepository {
  constructor(
    @InjectRepository(ProdutoOrmEntity)
    private readonly repo: Repository<ProdutoOrmEntity>,
  ) {}

  async upsertByCodigoErp(produto: Produto): Promise<Produto> {
    await this.repo.upsert(this.toOrm(produto), {
      conflictPaths: ['codigoErp'],
      upsertType: 'on-conflict-do-update',
      skipUpdateIfNoValuesChanged: true,
    });

    const saved = await this.repo.findOneByOrFail({ codigoErp: produto.codigoErp! });
    return this.toDomain(saved);
  }

  async findByCodigoErp(codigoErp: string): Promise<Produto | null> {
    const entity = await this.repo.findOneBy({ codigoErp });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdErp(idErp: string): Promise<Produto | null> {
    const entity = await this.repo.findOneBy({ idErp });
    return entity ? this.toDomain(entity) : null;
  }

  async findAll(filtros: FiltroProduto): Promise<Produto[]> {
    const qb = this.repo.createQueryBuilder('p');

    if (filtros.categoria !== undefined) {
      qb.andWhere('p.categoria = :categoria', { categoria: filtros.categoria });
    }
    if (filtros.familia !== undefined) {
      qb.andWhere('p.familia = :familia', { familia: filtros.familia });
    }
    if (filtros.ativo !== undefined) {
      qb.andWhere('p.ativo = :ativo', { ativo: filtros.ativo });
    }

    // CADA PALAVRA precisa aparecer em ALGUM campo — e nao a frase inteira
    // num campo so. "brinco de esmeralda" nao casa com "Brinco Vintage
    // Esmeralda" se procurado como uma string unica, porque as palavras nao
    // sao vizinhas. Entao: AND entre as palavras, OR entre as colunas.
    //
    // Palavras de ate dois caracteres saem ("de", "do", "e"): elas casam com
    // quase tudo e so estragariam o filtro.
    for (const [i, palavra] of palavrasDaBusca(filtros.busca).entries()) {
      const chave = `busca${i}`;
      const termo = `%${palavra}%`;
      qb.andWhere(
        // Os parenteses importam: sem eles o OR vazaria e anularia os
        // filtros de categoria/familia/ativo acima.
        new Brackets((b) =>
          b
            .where(`p.descricao_etiqueta ILIKE :${chave}`, { [chave]: termo })
            .orWhere(`p.categoria ILIKE :${chave}`, { [chave]: termo })
            .orWhere(`p.familia ILIKE :${chave}`, { [chave]: termo })
            .orWhere(`p.colecao ILIKE :${chave}`, { [chave]: termo })
            .orWhere(`p.tipo_pedra ILIKE :${chave}`, { [chave]: termo })
            .orWhere(`p.cor ILIKE :${chave}`, { [chave]: termo })
            .orWhere(`p.codigo_erp ILIKE :${chave}`, { [chave]: termo }),
        ),
      );
    }

    qb.orderBy('p.criado_em', 'DESC');
    if (filtros.limit) qb.take(filtros.limit);

    const entities = await qb.getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string): Promise<Produto | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? this.toDomain(entity) : null;
  }

  async save(produto: Produto): Promise<Produto> {
    const data: Partial<ProdutoOrmEntity> = {
      ...this.toOrm(produto),
      ...(produto.id ? { id: produto.id } : {}),
    };
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async saveMany(produtos: Produto[]): Promise<Produto[]> {
    const entities = produtos.map((p) =>
      this.repo.create({
        ...this.toOrm(p),
        ...(p.id ? { id: p.id } : {}),
      }),
    );
    // repo.save com array roda numa transacao (all-or-nothing): se um item
    // viola constraint (ex.: codigoErp duplicado), o lote inteiro reverte.
    const saved = await this.repo.save(entities);
    return saved.map((e) => this.toDomain(e));
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async facetas(): Promise<FacetasProduto> {
    const [fornecedores, categorias, familias] = await Promise.all([
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT referencia_fornecedor AS v FROM produtos
         WHERE referencia_fornecedor IS NOT NULL AND referencia_fornecedor <> '' ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT categoria AS v FROM produtos WHERE categoria <> '' ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT familia AS v FROM produtos WHERE familia <> '' ORDER BY 1`,
      ),
    ]);
    return {
      fornecedores: fornecedores.map((r) => r.v),
      categorias: categorias.map((r) => r.v),
      familias: familias.map((r) => r.v),
    };
  }

  async alertasEstoque(limiteBaixo: number, diasGiroLento: number): Promise<AlertasEstoque> {
    const [estoqueBaixo, giroLento] = await Promise.all([
      this.repo.manager.query<ProdutoAlerta[]>(
        `
        SELECT id, ${NOME_PRODUTO} AS nome, categoria, familia,
               NULLIF(referencia_fornecedor, '') AS fornecedor,
               estoque_atual AS "estoqueAtual",
               NULL::int AS "diasEmEstoque"
        FROM produtos
        WHERE ativo = true AND estoque_atual <= $1
        ORDER BY estoque_atual ASC
        LIMIT 50
        `,
        [limiteBaixo],
      ),
      this.repo.manager.query<ProdutoAlerta[]>(
        `
        SELECT id, ${NOME_PRODUTO} AS nome, categoria, familia,
               NULLIF(referencia_fornecedor, '') AS fornecedor,
               estoque_atual AS "estoqueAtual",
               EXTRACT(DAY FROM (now() - data_entrada_estoque))::int AS "diasEmEstoque"
        FROM produtos
        WHERE ativo = true AND estoque_atual > 0
          AND data_entrada_estoque IS NOT NULL
          AND data_entrada_estoque <= now() - ($1::int * interval '1 day')
        ORDER BY data_entrada_estoque ASC
        LIMIT 50
        `,
        [diasGiroLento],
      ),
    ]);
    return { estoqueBaixo, giroLento };
  }

  private toOrm(p: Produto): Partial<ProdutoOrmEntity> {
    return {
      idErp: p.idErp,
      codigoErp: p.codigoErp,
      categoria: p.categoria,
      familia: p.familia,
      colecao: p.colecao,
      cor: p.cor,
      tamanho: p.tamanho,
      tipoPedra: p.tipoPedra,
      colecaoPedra: p.colecaoPedra,
      referenciaFornecedor: p.referenciaFornecedor,
      descricaoEtiqueta: p.descricaoEtiqueta,
      pesoGramas: p.pesoGramas,
      unidade: p.unidade,
      valorCompra: p.valorCompra,
      valorCusto: p.valorCusto,
      margemPercentual: p.margemPercentual,
      valorVenda: p.valorVenda,
      observacao: p.observacao,
      fotoUrl: p.fotoUrl,
      ativo: p.ativo,
      estoqueAtual: p.estoqueAtual ?? 0,
      dataEntradaEstoque: p.dataEntradaEstoque,
    };
  }

  private toDomain(o: ProdutoOrmEntity): Produto {
    return Produto.create({
      idErp: o.idErp,
      id: o.id,
      codigoErp: o.codigoErp,
      categoria: o.categoria,
      familia: o.familia,
      colecao: o.colecao,
      cor: o.cor,
      tamanho: o.tamanho,
      tipoPedra: o.tipoPedra,
      colecaoPedra: o.colecaoPedra,
      referenciaFornecedor: o.referenciaFornecedor,
      descricaoEtiqueta: o.descricaoEtiqueta,
      pesoGramas: o.pesoGramas ? Number(o.pesoGramas) : null,
      unidade: o.unidade,
      valorCompra: o.valorCompra ? Number(o.valorCompra) : null,
      valorCusto: o.valorCusto ? Number(o.valorCusto) : null,
      margemPercentual: o.margemPercentual ? Number(o.margemPercentual) : null,
      valorVenda: Number(o.valorVenda),
      observacao: o.observacao,
      fotoUrl: o.fotoUrl,
      ativo: o.ativo,
      estoqueAtual: o.estoqueAtual ?? 0,
      dataEntradaEstoque: o.dataEntradaEstoque,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}

/**
 * Palavras uteis de uma busca livre. Descarta as de ate dois caracteres — "de",
 * "do", "e" casam com quase tudo — e limita a quatro, para uma frase longa nao
 * virar oito condicoes no banco.
 */
function palavrasDaBusca(busca: string | undefined): string[] {
  return (busca ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 4);
}
