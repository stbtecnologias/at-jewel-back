import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { GrupoEstoque } from '../../../../domain/entities/grupo-estoque.entity';
import {
  FiltroGrupoEstoque,
  IGrupoEstoqueRepository,
} from '../../../../domain/ports/repositories/grupo-estoque-repository.port';
import { GrupoEstoqueOrmEntity } from '../entities/grupo-estoque.orm-entity';

@Injectable()
export class GrupoEstoqueRepository implements IGrupoEstoqueRepository {
  constructor(
    @InjectRepository(GrupoEstoqueOrmEntity)
    private readonly repo: Repository<GrupoEstoqueOrmEntity>,
  ) {}

  async criar(e: GrupoEstoque): Promise<GrupoEstoque> {
    const row = this.repo.create(this.toOrm(e));
    const salvo = await this.repo.save(row);
    return this.toDomain(salvo);
  }

  async buscarPorId(id: string): Promise<GrupoEstoque | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<GrupoEstoque | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroGrupoEstoque): Promise<GrupoEstoque[]> {
    const where: FindOptionsWhere<GrupoEstoqueOrmEntity> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.busca) where.nome = ILike(`%${filtros.busca}%`);

    // Ordena por codigo ERP: e como o cadastro chega do ERP, e mantem a ordem
    // estavel entre chamadas.
    const rows = await this.repo.find({
      where,
      order: { codigoErp: 'ASC', nome: 'ASC' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(e: GrupoEstoque): Promise<GrupoEstoque> {
    if (!e.id) throw new Error('GrupoEstoque sem id nao pode ser atualizada');
    await this.repo.update(e.id, this.toOrm(e));
    const atualizado = await this.repo.findOneByOrFail({ id: e.id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toOrm(e: GrupoEstoque): Partial<GrupoEstoqueOrmEntity> {
    return { codigoErp: e.codigoErp, nome: e.nome, ativo: e.ativo };
  }

  private toDomain(o: GrupoEstoqueOrmEntity): GrupoEstoque {
    return GrupoEstoque.create({
      id: o.id,
      codigoErp: o.codigoErp,
      nome: o.nome,
      ativo: o.ativo,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
