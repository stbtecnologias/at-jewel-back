import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { FormaPagamentoEntity } from '../../../../domain/entities/forma-pagamento.entity';
import {
  FiltroFormaPagamento,
  IFormaPagamentoRepository,
} from '../../../../domain/ports/repositories/forma-pagamento-repository.port';
import { FormaPagamentoOrmEntity } from '../entities/forma-pagamento.orm-entity';

@Injectable()
export class FormaPagamentoRepository implements IFormaPagamentoRepository {
  constructor(
    @InjectRepository(FormaPagamentoOrmEntity)
    private readonly repo: Repository<FormaPagamentoOrmEntity>,
  ) {}

  async criar(f: FormaPagamentoEntity): Promise<FormaPagamentoEntity> {
    const row = this.repo.create(this.toOrm(f));
    const salvo = await this.repo.save(row);
    return this.toDomain(salvo);
  }

  async buscarPorId(id: string): Promise<FormaPagamentoEntity | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<FormaPagamentoEntity | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroFormaPagamento): Promise<FormaPagamentoEntity[]> {
    const where: FindOptionsWhere<FormaPagamentoOrmEntity> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.classificacao) where.classificacao = filtros.classificacao;
    if (filtros.busca) where.nome = ILike(`%${filtros.busca}%`);

    // Ordena por classificacao e depois por nome: agrupa "Cartao Visa 3x" e
    // "Cartao Master 6x" lado a lado na tela, que e como se escolhe na pratica.
    const rows = await this.repo.find({
      where,
      order: { classificacao: 'ASC', nome: 'ASC' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(f: FormaPagamentoEntity): Promise<FormaPagamentoEntity> {
    if (!f.id) throw new Error('Forma de pagamento sem id nao pode ser atualizada');
    await this.repo.update(f.id, this.toOrm(f));
    const atualizado = await this.repo.findOneByOrFail({ id: f.id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toOrm(f: FormaPagamentoEntity): Partial<FormaPagamentoOrmEntity> {
    return {
      codigoErp: f.codigoErp,
      nome: f.nome,
      classificacao: f.classificacao,
      ativo: f.ativo,
    };
  }

  private toDomain(o: FormaPagamentoOrmEntity): FormaPagamentoEntity {
    return FormaPagamentoEntity.create({
      id: o.id,
      codigoErp: o.codigoErp,
      nome: o.nome,
      classificacao: o.classificacao,
      ativo: o.ativo,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
