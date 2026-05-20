import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Produto } from '../../../../domain/entities/produto.entity';
import { IProdutoRepository } from '../../../../domain/ports/repositories/produto-repository.port';
import { ProdutoOrmEntity } from '../entities/produto.orm-entity';

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

  private toOrm(p: Produto): Partial<ProdutoOrmEntity> {
    return {
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
    };
  }

  private toDomain(o: ProdutoOrmEntity): Produto {
    return Produto.create({
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
    });
  }
}
