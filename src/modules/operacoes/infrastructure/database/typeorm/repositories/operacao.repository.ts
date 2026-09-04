import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  OperacaoEmUsoError,
  OperacaoEntity,
} from '../../../../domain/entities/operacao.entity';

/** `foreign_key_violation`, tanto no erro do driver quanto no wrapper do TypeORM. */
const CODIGO_FK_VIOLADA = '23503';

function ehViolacaoDeChaveEstrangeira(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const e = erro as { code?: unknown; driverError?: { code?: unknown } };
  return (
    e.code === CODIGO_FK_VIOLADA || e.driverError?.code === CODIGO_FK_VIOLADA
  );
}
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

  /**
   * `23503` e o `foreign_key_violation` do Postgres. E a unica falha esperada
   * aqui, e vem de `movimentacoes.operacao_id`, que e ON DELETE RESTRICT.
   *
   * Checar o codigo em vez de contar movimentacoes antes: a contagem seria uma
   * corrida — nada impede um documento chegar entre a contagem e o DELETE. O
   * banco decide, e a gente traduz.
   */
  async remover(id: string): Promise<void> {
    try {
      await this.repo.delete(id);
    } catch (erro) {
      if (ehViolacaoDeChaveEstrangeira(erro)) {
        throw new OperacaoEmUsoError();
      }
      throw erro;
    }
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
