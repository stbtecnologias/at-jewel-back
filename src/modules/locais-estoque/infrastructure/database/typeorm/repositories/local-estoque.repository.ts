import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { LocalEstoque } from '../../../../domain/entities/local-estoque.entity';
import {
  FiltroLocalEstoque,
  ILocalEstoqueRepository,
} from '../../../../domain/ports/repositories/local-estoque-repository.port';
import { LocalEstoqueOrmEntity } from '../entities/local-estoque.orm-entity';

@Injectable()
export class LocalEstoqueRepository implements ILocalEstoqueRepository {
  constructor(
    @InjectRepository(LocalEstoqueOrmEntity)
    private readonly repo: Repository<LocalEstoqueOrmEntity>,
  ) {}

  async criar(e: LocalEstoque): Promise<LocalEstoque> {
    const row = this.repo.create(this.toOrm(e));
    const salvo = await this.repo.save(row);
    return this.toDomain(salvo);
  }

  async buscarPorId(id: string): Promise<LocalEstoque | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorIdErp(idErp: string): Promise<LocalEstoque | null> {
    const row = await this.repo.findOne({ where: { idErp } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<LocalEstoque | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroLocalEstoque): Promise<LocalEstoque[]> {
    const where: FindOptionsWhere<LocalEstoqueOrmEntity> = {};
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

  async atualizar(e: LocalEstoque): Promise<LocalEstoque> {
    if (!e.id) throw new Error('LocalEstoque sem id nao pode ser atualizada');
    await this.repo.update(e.id, this.toOrm(e));
    const atualizado = await this.repo.findOneByOrFail({ id: e.id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toOrm(e: LocalEstoque): Partial<LocalEstoqueOrmEntity> {
    return { idErp: e.idErp, codigoErp: e.codigoErp, nome: e.nome, ativo: e.ativo };
  }

  private toDomain(o: LocalEstoqueOrmEntity): LocalEstoque {
    return LocalEstoque.create({
      id: o.id,
      idErp: o.idErp,
      codigoErp: o.codigoErp,
      nome: o.nome,
      ativo: o.ativo,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
