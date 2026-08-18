import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, LessThan, Repository } from 'typeorm';
import { Estoque } from '../../../../domain/entities/estoque.entity';
import {
  ChaveEstoque,
  FiltroEstoque,
  IEstoqueRepository,
} from '../../../../domain/ports/repositories/estoque-repository.port';
import { EstoqueOrmEntity } from '../entities/estoque.orm-entity';

@Injectable()
export class EstoqueRepository implements IEstoqueRepository {
  constructor(
    @InjectRepository(EstoqueOrmEntity)
    private readonly repo: Repository<EstoqueOrmEntity>,
  ) {}

  async criar(e: Estoque): Promise<Estoque> {
    const row = this.repo.create(this.toOrm(e));
    const salvo = await this.repo.save(row);
    return this.toDomain(await this.repo.findOneByOrFail({ id: salvo.id }));
  }

  async buscarPorId(id: string): Promise<Estoque | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Busca pela chave de negocio. As contrapartes ausentes entram como
   * `IsNull()` explicito: sem isso o TypeORM ignoraria a coluna e a consulta
   * casaria com linhas de OUTRA contraparte do mesmo produto.
   */
  async buscarPorChave(chave: ChaveEstoque): Promise<Estoque | null> {
    const row = await this.repo.findOne({
      where: {
        empresaId: chave.empresaId,
        grupoEstoqueId: chave.grupoEstoqueId,
        produtoId: chave.produtoId,
        localEstoqueId: chave.localEstoqueId ?? IsNull(),
        fornecedorId: chave.fornecedorId ?? IsNull(),
        clienteId: chave.clienteId ?? IsNull(),
        vendedoraId: chave.vendedoraId ?? IsNull(),
      },
    });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroEstoque): Promise<Estoque[]> {
    const where: FindOptionsWhere<EstoqueOrmEntity> = {};
    if (filtros.empresaId) where.empresaId = filtros.empresaId;
    if (filtros.grupoEstoqueId) where.grupoEstoqueId = filtros.grupoEstoqueId;
    if (filtros.produtoId) where.produtoId = filtros.produtoId;
    if (filtros.localEstoqueId) where.localEstoqueId = filtros.localEstoqueId;
    if (filtros.fornecedorId) where.fornecedorId = filtros.fornecedorId;
    if (filtros.clienteId) where.clienteId = filtros.clienteId;
    if (filtros.vendedoraId) where.vendedoraId = filtros.vendedoraId;
    if (filtros.apenasNegativos) where.quantidade = LessThan(0);

    const rows = await this.repo.find({
      where,
      order: { produtoId: 'ASC', contraparteTipo: 'ASC' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(e: Estoque): Promise<Estoque> {
    if (!e.id) throw new Error('Saldo sem id nao pode ser atualizado');
    await this.repo.update(e.id, this.toOrm(e));
    return this.toDomain(await this.repo.findOneByOrFail({ id: e.id }));
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<Estoque | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  /**
   * INSERT ... ON CONFLICT DO UPDATE. Query escrita a mao porque o `orUpdate`
   * do QueryBuilder monta conflito por lista de colunas, e a chave composta
   * inclui `contraparte_tipo`/`contraparte_id`, que sao GENERATED e nao podem
   * aparecer num INSERT.
   *
   * DOIS CAMINHOS, conforme a origem do dado:
   *
   *   COM codigo_erp (integracao) — conflita pelo CODIGO e atualiza tambem as
   *   dimensoes. E o que permite o ERP REMANEJAR a linha: a mesma peca sai do
   *   Armario 01 para o 02 e continua sendo a mesma linha de la, com o mesmo
   *   codigo. Se em vez disso conflitasse pela chave composta, o remanejamento
   *   criaria uma linha nova e a antiga ficaria com saldo fantasma.
   *
   *   SEM codigo_erp (tela) — conflita pela chave composta e atualiza so a
   *   quantidade, porque quem lanca pela tela identifica o saldo pelas quatro
   *   dimensoes, nao por um codigo que ele nao tem.
   */
  async upsert(e: Estoque): Promise<Estoque> {
    const valores = [
      e.codigoErp,
      e.empresaId,
      e.grupoEstoqueId,
      e.produtoId,
      e.localEstoqueId,
      e.fornecedorId,
      e.clienteId,
      e.vendedoraId,
      e.quantidade,
    ];

    const conflito = e.codigoErp
      ? `ON CONFLICT (codigo_erp) DO UPDATE SET
           empresa_id       = EXCLUDED.empresa_id,
           grupo_estoque_id = EXCLUDED.grupo_estoque_id,
           produto_id       = EXCLUDED.produto_id,
           local_estoque_id = EXCLUDED.local_estoque_id,
           fornecedor_id    = EXCLUDED.fornecedor_id,
           cliente_id       = EXCLUDED.cliente_id,
           vendedora_id     = EXCLUDED.vendedora_id,
           quantidade       = EXCLUDED.quantidade,
           atualizado_em    = now()`
      : `ON CONFLICT ON CONSTRAINT uq_estoque_chave DO UPDATE SET
           quantidade    = EXCLUDED.quantidade,
           atualizado_em = now()`;

    const linhas = (await this.repo.query(
      `INSERT INTO estoque
         (codigo_erp, empresa_id, grupo_estoque_id, produto_id,
          local_estoque_id, fornecedor_id, cliente_id, vendedora_id, quantidade)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ${conflito}
       RETURNING id`,
      valores,
    )) as { id: string }[];

    return this.toDomain(await this.repo.findOneByOrFail({ id: linhas[0].id }));
  }

  private toOrm(e: Estoque): Partial<EstoqueOrmEntity> {
    return {
      codigoErp: e.codigoErp,
      empresaId: e.empresaId,
      grupoEstoqueId: e.grupoEstoqueId,
      produtoId: e.produtoId,
      localEstoqueId: e.localEstoqueId,
      fornecedorId: e.fornecedorId,
      clienteId: e.clienteId,
      vendedoraId: e.vendedoraId,
      quantidade: e.quantidade,
    };
  }

  private toDomain(o: EstoqueOrmEntity): Estoque {
    return Estoque.create({
      id: o.id,
      codigoErp: o.codigoErp,
      empresaId: o.empresaId,
      grupoEstoqueId: o.grupoEstoqueId,
      produtoId: o.produtoId,
      localEstoqueId: o.localEstoqueId,
      fornecedorId: o.fornecedorId,
      clienteId: o.clienteId,
      vendedoraId: o.vendedoraId,
      quantidade: Number(o.quantidade),
      contraparteTipo: o.contraparteTipo,
      contraparteId: o.contraparteId,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
