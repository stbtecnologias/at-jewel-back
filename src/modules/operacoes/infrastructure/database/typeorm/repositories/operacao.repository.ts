import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { OperacaoEntity } from '../../../../domain/entities/operacao.entity';
import {
  FiltroOperacao,
  IOperacaoRepository,
} from '../../../../domain/ports/repositories/operacao-repository.port';
import { OperacaoOrmEntity } from '../entities/operacao.orm-entity';

@Injectable()
export class OperacaoRepository implements IOperacaoRepository {
  constructor(
    @InjectRepository(OperacaoOrmEntity)
    private readonly repo: Repository<OperacaoOrmEntity>,
  ) {}

  async criar(o: OperacaoEntity): Promise<OperacaoEntity> {
    const row = this.repo.create(this.toOrm(o));
    const salvo = await this.repo.save(row);
    return this.toDomain(salvo);
  }

  async buscarPorId(id: string): Promise<OperacaoEntity | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorIdErp(idErp: string): Promise<OperacaoEntity | null> {
    const row = await this.repo.findOne({ where: { idErp } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<OperacaoEntity | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroOperacao): Promise<OperacaoEntity[]> {
    const where: FindOptionsWhere<OperacaoOrmEntity> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.classificacao) where.classificacao = filtros.classificacao;
    if (filtros.busca) where.nome = ILike(`%${filtros.busca}%`);

    // Agrupa por classificacao antes do nome: e assim que se confere o de-para
    // com o Alessandro — "o que esta caindo como OUTRA?" e a pergunta que a
    // tela existe para responder.
    const rows = await this.repo.find({
      where,
      order: { classificacao: 'ASC', nome: 'ASC' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(o: OperacaoEntity): Promise<OperacaoEntity> {
    if (!o.id) throw new Error('Operacao sem id nao pode ser atualizada');
    await this.repo.update(o.id, this.toOrm(o));
    const atualizado = await this.repo.findOneByOrFail({ id: o.id });
    return this.toDomain(atualizado);
  }

  private toOrm(o: OperacaoEntity): Partial<OperacaoOrmEntity> {
    return {
      idErp: o.idErp,
      codigoErp: o.codigoErp,
      nome: o.nome,
      classificacao: o.classificacao,
      ativo: o.ativo,
    };
  }

  private toDomain(o: OperacaoOrmEntity): OperacaoEntity {
    return OperacaoEntity.create({
      id: o.id,
      idErp: o.idErp,
      codigoErp: o.codigoErp,
      nome: o.nome,
      classificacao: o.classificacao,
      ativo: o.ativo,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
