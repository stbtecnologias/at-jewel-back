import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Defeito } from '../../../../domain/entities/defeito.entity';
import type {
  AtualizarDefeitoData,
  DefeitoKpis,
  FiltroDefeito,
  FiltroKpiDefeito,
  IDefeitoRepository,
  ResultadoPaginadoDefeito,
} from '../../../../domain/ports/repositories/defeito-repository.port';
import { DefeitoOrmEntity } from '../entities/defeito.orm-entity';

@Injectable()
export class DefeitoRepository implements IDefeitoRepository {
  constructor(
    @InjectRepository(DefeitoOrmEntity)
    private readonly repo: Repository<DefeitoOrmEntity>,
  ) {}

  async criar(defeito: Defeito): Promise<Defeito> {
    const entity = this.repo.create(this.toOrm(defeito));
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async listar(filtro: FiltroDefeito): Promise<ResultadoPaginadoDefeito> {
    const where = this.montarWhere(filtro);
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { data: 'DESC' },
      skip: (filtro.page - 1) * filtro.limit,
      take: filtro.limit,
    });
    return { data: rows.map((r) => this.toDomain(r)), total };
  }

  async buscarPorId(id: string): Promise<Defeito | null> {
    const row = await this.repo.findOneBy({ id });
    return row ? this.toDomain(row) : null;
  }

  async atualizar(id: string, dados: AtualizarDefeitoData): Promise<Defeito> {
    const patch: Partial<DefeitoOrmEntity> = {};
    if (dados.produtoId !== undefined) patch.produtoId = dados.produtoId;
    if (dados.tipo !== undefined) patch.tipo = dados.tipo;
    if (dados.descricao !== undefined) patch.descricao = dados.descricao;
    if (dados.data !== undefined) patch.data = dados.data;
    if (dados.resolucao !== undefined) patch.resolucao = dados.resolucao;

    await this.repo.update(id, patch);
    const atualizado = await this.repo.findOneByOrFail({ id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async kpis(filtro: FiltroKpiDefeito): Promise<DefeitoKpis> {
    const qb = this.repo
      .createQueryBuilder('d')
      .select('d.tipo', 'tipo')
      .addSelect('COUNT(d.id)', 'total')
      .groupBy('d.tipo');

    if (filtro.dataInicio && filtro.dataFim) {
      qb.where('d.data BETWEEN :inicio AND :fim', {
        inicio: filtro.dataInicio,
        fim: filtro.dataFim,
      });
    }

    const linhas = await qb.getRawMany<{ tipo: DefeitoKpis['porTipo'][number]['tipo']; total: string }>();
    const porTipo = linhas.map((l) => ({ tipo: l.tipo, total: Number(l.total) }));
    const total = porTipo.reduce((acc, t) => acc + t.total, 0);
    return { total, porTipo };
  }

  private montarWhere(filtro: FiltroDefeito): FindOptionsWhere<DefeitoOrmEntity> {
    const where: FindOptionsWhere<DefeitoOrmEntity> = {};
    if (filtro.tipo !== undefined) where.tipo = filtro.tipo;
    if (filtro.produtoId !== undefined) where.produtoId = filtro.produtoId;
    if (filtro.dataInicio && filtro.dataFim) {
      where.data = Between(filtro.dataInicio, filtro.dataFim);
    }
    return where;
  }

  private toOrm(d: Defeito): Partial<DefeitoOrmEntity> {
    return {
      ...(d.id ? { id: d.id } : {}),
      produtoId: d.produtoId,
      tipo: d.tipo,
      descricao: d.descricao,
      data: d.data,
      resolucao: d.resolucao,
    };
  }

  private toDomain(o: DefeitoOrmEntity): Defeito {
    return Defeito.create({
      id: o.id,
      produtoId: o.produtoId,
      tipo: o.tipo,
      descricao: o.descricao,
      data: o.data,
      resolucao: o.resolucao,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
