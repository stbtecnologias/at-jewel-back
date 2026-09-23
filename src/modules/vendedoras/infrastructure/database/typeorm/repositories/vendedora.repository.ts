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

  async buscarPorIdErp(idErp: string): Promise<Vendedora | null> {
    const row = await this.repo.findOne({ where: { idErp } });
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

  /**
   * ======================================================================
   * OLHA OS DOIS NUMEROS, E ISSO E O QUE A MIGRACAO 39 PEDIU POR ESCRITO.
   *
   * Ha um indice unico por COLUNA, mas nenhuma unicidade no CONJUNTO das
   * duas: nada no banco impede que o corporativo da Camila seja igual ao
   * PESSOAL da Beatriz. A trava fica aqui, na aplicacao — e olhar so o
   * interno deixaria essa colisao passar, virando ambiguidade de identidade
   * no canal.
   * ======================================================================
   */
  async buscarPorWhatsappHash(hash: string): Promise<Vendedora | null> {
    const row = await this.repo.findOne({
      where: [{ whatsappInternoHash: hash }, { whatsappExternoHash: hash }],
    });
    return row ? this.toDomain(row) : null;
  }

  async proximoCodigoInterno(): Promise<string> {
    // Ordena pelo NUMERO e nao pelo texto: por texto, "VD-9" viria depois de
    // "VD-10" e a sequencia repetiria um codigo ja usado.
    const linhas: { codigo_erp: string }[] = await this.repo.manager.query(
      `SELECT codigo_erp FROM vendedoras
        WHERE codigo_erp ~ '^VD-[0-9]+
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

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toOrm(v: Vendedora): Partial<VendedoraOrmEntity> {
    return {
      idErp: v.idErp,
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
      whatsappExterno: v.whatsappExterno,
      whatsappExternoHash: v.whatsappExternoHash,
      adminUserId: v.adminUserId,
    };
  }

  private toDomain(o: VendedoraOrmEntity): Vendedora {
    return Vendedora.create({
      id: o.id,
      idErp: o.idErp,
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
      whatsappExterno: o.whatsappExterno,
      whatsappExternoHash: o.whatsappExternoHash,
      adminUserId: o.adminUserId,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}

        ORDER BY (substring(codigo_erp from 4))::int DESC
        LIMIT 1`,
    );
    const ultimo = linhas[0]
      ? Number(linhas[0].codigo_erp.slice(3))
      : 0;
    return `VD-${String(ultimo + 1).padStart(4, '0')}`;
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

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toOrm(v: Vendedora): Partial<VendedoraOrmEntity> {
    return {
      idErp: v.idErp,
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
      whatsappExterno: v.whatsappExterno,
      whatsappExternoHash: v.whatsappExternoHash,
      adminUserId: v.adminUserId,
    };
  }

  private toDomain(o: VendedoraOrmEntity): Vendedora {
    return Vendedora.create({
      id: o.id,
      idErp: o.idErp,
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
      whatsappExterno: o.whatsappExterno,
      whatsappExternoHash: o.whatsappExternoHash,
      adminUserId: o.adminUserId,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
