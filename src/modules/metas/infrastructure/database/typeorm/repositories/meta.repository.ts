import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Meta } from '../../../../domain/entities/meta.entity';
import type {
  AtualizarMetaData,
  FiltroMeta,
  IMetaRepository,
} from '../../../../domain/ports/repositories/meta-repository.port';
import { MetaOrmEntity } from '../entities/meta.orm-entity';

@Injectable()
export class MetaRepository implements IMetaRepository {
  constructor(
    @InjectRepository(MetaOrmEntity)
    private readonly repo: Repository<MetaOrmEntity>,
  ) {}

  async criar(meta: Meta): Promise<Meta> {
    const entity = this.repo.create(this.toOrm(meta));
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async listar(filtro: FiltroMeta): Promise<Meta[]> {
    const where: FindOptionsWhere<MetaOrmEntity> = {};
    if (filtro.tipo !== undefined) where.tipo = filtro.tipo;
    if (filtro.referenciaId !== undefined) where.referenciaId = filtro.referenciaId;

    const rows = await this.repo.find({ where, order: { prazo: 'ASC' } });
    return rows.map((r) => this.toDomain(r));
  }

  async buscarPorId(id: string): Promise<Meta | null> {
    const row = await this.repo.findOneBy({ id });
    return row ? this.toDomain(row) : null;
  }

  async atualizar(id: string, dados: AtualizarMetaData): Promise<Meta> {
    const patch: Partial<MetaOrmEntity> = {};
    if (dados.tipo !== undefined) patch.tipo = dados.tipo;
    if (dados.referenciaId !== undefined) patch.referenciaId = dados.referenciaId;
    if (dados.valorAlvo !== undefined) patch.valorAlvo = dados.valorAlvo.toString();
    if (dados.prazo !== undefined) patch.prazo = dados.prazo;
    if (dados.descricao !== undefined) patch.descricao = dados.descricao;

    await this.repo.update(id, patch);
    const atualizado = await this.repo.findOneByOrFail({ id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async calcularRealizado(meta: Meta): Promise<number> {
    const inicio = meta.criadoEm ?? new Date(0);
    const fim = meta.prazo;

    // POR_PRODUTO soma os itens da venda; os demais somam o total da venda.
    if (meta.tipo === 'POR_PRODUTO') {
      const rows = await this.repo.manager.query<{ total: number }[]>(
        `
        SELECT COALESCE(SUM(i.valor_total_item), 0)::float AS total
        FROM itens_venda i
        JOIN vendas v ON v.id = i.venda_id AND v.status = 'concluida'
        WHERE i.produto_id = $1 AND v.data_venda BETWEEN $2 AND $3
        `,
        [meta.referenciaId, inicio, fim],
      );
      return rows[0]?.total ?? 0;
    }

    const params: unknown[] = [inicio, fim];
    let filtro = '';
    if (meta.tipo === 'POR_VENDEDORA') {
      filtro = 'AND vendedora_id = $3';
      params.push(meta.referenciaId);
    } else if (meta.tipo === 'POR_CLIENTE') {
      filtro = 'AND cliente_id = $3';
      params.push(meta.referenciaId);
    }

    const rows = await this.repo.manager.query<{ total: number }[]>(
      `
      SELECT COALESCE(SUM(valor_total), 0)::float AS total
      FROM vendas
      WHERE status = 'concluida' AND data_venda BETWEEN $1 AND $2 ${filtro}
      `,
      params,
    );
    return rows[0]?.total ?? 0;
  }

  private toOrm(m: Meta): Partial<MetaOrmEntity> {
    return {
      ...(m.id ? { id: m.id } : {}),
      tipo: m.tipo,
      referenciaId: m.referenciaId,
      valorAlvo: m.valorAlvo.toString(),
      prazo: m.prazo,
      descricao: m.descricao,
    };
  }

  private toDomain(o: MetaOrmEntity): Meta {
    return Meta.create({
      id: o.id,
      tipo: o.tipo,
      referenciaId: o.referenciaId,
      valorAlvo: Number(o.valorAlvo),
      prazo: o.prazo,
      descricao: o.descricao,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
