import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Vendedora } from '../../../../domain/entities/vendedora.entity';
import {
  FiltroVendedora,
  IVendedoraRepository,
} from '../../../../domain/ports/repositories/vendedora-repository.port';
import { VendedoraOrmEntity } from '../entities/vendedora.orm-entity';

@Injectable()
export class VendedoraRepository implements IVendedoraRepository {
  constructor(
    @InjectRepository(VendedoraOrmEntity)
    private readonly repo: Repository<VendedoraOrmEntity>,
  ) {}

  async criar(v: Vendedora): Promise<Vendedora> {
    const row = this.repo.create(this.toOrm(v));
    const saved = await this.repo.save(row);
    return this.toDomain(saved);
  }

  async buscarPorId(id: string): Promise<Vendedora | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<Vendedora | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorEmailHash(hash: string): Promise<Vendedora | null> {
    const row = await this.repo.findOne({ where: { emailHash: hash } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorWhatsappHash(hash: string): Promise<Vendedora | null> {
    const row = await this.repo.findOne({ where: { whatsappInternoHash: hash } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroVendedora): Promise<Vendedora[]> {
    // Filtro por especialidades exige operador @> (array contains), que
    // o FindOptionsWhere nao expressa diretamente — usar QueryBuilder.
    const qb = this.repo.createQueryBuilder('v');

    if (filtros.ativo !== undefined) qb.andWhere('v.ativo = :ativo', { ativo: filtros.ativo });
    if (filtros.tipo !== undefined) qb.andWhere('v.tipo = :tipo', { tipo: filtros.tipo });
    if (filtros.statusDisponibilidade !== undefined) {
      qb.andWhere('v.status_disponibilidade = :status', {
        status: filtros.statusDisponibilidade,
      });
    }
    if (filtros.especialidades !== undefined && filtros.especialidades.length > 0) {
      qb.andWhere('v.especialidades @> :esp::text[]', { esp: filtros.especialidades });
    }

    qb.orderBy('v.nome', 'ASC');
    const rows = await qb.getMany();
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(v: Vendedora): Promise<Vendedora> {
    if (!v.id) throw new Error('Vendedora sem id nao pode ser atualizada');
    await this.repo.update(v.id, this.toOrm(v));
    const refreshed = await this.repo.findOneByOrFail({ id: v.id });
    return this.toDomain(refreshed);
  }

  private toOrm(v: Vendedora): Partial<VendedoraOrmEntity> {
    return {
      codigoErp: v.codigoErp,
      nome: v.nome,
      tipo: v.tipo,
      ativo: v.ativo,
      statusDisponibilidade: v.statusDisponibilidade,
      especialidades: v.especialidades,
      email: v.email,
      emailHash: v.emailHash,
      whatsappInterno: v.whatsappInterno,
      whatsappInternoHash: v.whatsappInternoHash,
      adminUserId: v.adminUserId,
    };
  }

  private toDomain(o: VendedoraOrmEntity): Vendedora {
    return Vendedora.create({
      id: o.id,
      codigoErp: o.codigoErp,
      nome: o.nome,
      tipo: o.tipo,
      ativo: o.ativo,
      statusDisponibilidade: o.statusDisponibilidade,
      especialidades: o.especialidades ?? [],
      email: o.email,
      emailHash: o.emailHash,
      whatsappInterno: o.whatsappInterno,
      whatsappInternoHash: o.whatsappInternoHash,
      adminUserId: o.adminUserId,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
