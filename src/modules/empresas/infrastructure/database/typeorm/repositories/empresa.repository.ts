import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Empresa } from '../../../../domain/entities/empresa.entity';
import {
  FiltroEmpresa,
  IEmpresaRepository,
} from '../../../../domain/ports/repositories/empresa-repository.port';
import { EmpresaOrmEntity } from '../entities/empresa.orm-entity';

@Injectable()
export class EmpresaRepository implements IEmpresaRepository {
  constructor(
    @InjectRepository(EmpresaOrmEntity)
    private readonly repo: Repository<EmpresaOrmEntity>,
  ) {}

  async criar(e: Empresa): Promise<Empresa> {
    const row = this.repo.create(this.toOrm(e));
    const salvo = await this.repo.save(row);
    return this.toDomain(salvo);
  }

  async buscarPorId(id: string): Promise<Empresa | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorIdErp(idErp: string): Promise<Empresa | null> {
    const row = await this.repo.findOne({ where: { idErp } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<Empresa | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroEmpresa): Promise<Empresa[]> {
    const where: FindOptionsWhere<EmpresaOrmEntity> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.busca) where.nome = ILike(`%${filtros.busca}%`);

    // Ordena por codigo ERP: e como o Alessandro se refere as empresas
    // ("empresa 1", "empresa 5"), e mantem a ordem estavel entre chamadas.
    const rows = await this.repo.find({
      where,
      order: { codigoErp: 'ASC', nome: 'ASC' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(e: Empresa): Promise<Empresa> {
    if (!e.id) throw new Error('Empresa sem id nao pode ser atualizada');
    await this.repo.update(e.id, this.toOrm(e));
    const atualizado = await this.repo.findOneByOrFail({ id: e.id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toOrm(e: Empresa): Partial<EmpresaOrmEntity> {
    return { idErp: e.idErp, codigoErp: e.codigoErp, nome: e.nome, ativo: e.ativo };
  }

  private toDomain(o: EmpresaOrmEntity): Empresa {
    return Empresa.create({
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
