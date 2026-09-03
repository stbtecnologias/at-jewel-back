import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { MovimentacaoItem } from '../../../../domain/entities/movimentacao-item.entity';
import { MovimentacaoPagamento } from '../../../../domain/entities/movimentacao-pagamento.entity';
import { Movimentacao } from '../../../../domain/entities/movimentacao.entity';
import {
  FiltroMovimentacao,
  IMovimentacaoRepository,
  PaginaMovimentacoes,
} from '../../../../domain/ports/repositories/movimentacao-repository.port';
import { MovimentacaoItemOrmEntity } from '../entities/movimentacao-item.orm-entity';
import { MovimentacaoPagamentoOrmEntity } from '../entities/movimentacao-pagamento.orm-entity';
import { MovimentacaoOrmEntity } from '../entities/movimentacao.orm-entity';

// Limites de paginacao para conter abuso e custo de query — os mesmos de
// `venda.repository.ts`.
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

@Injectable()
export class MovimentacaoRepository implements IMovimentacaoRepository {
  constructor(
    @InjectRepository(MovimentacaoOrmEntity)
    private readonly repo: Repository<MovimentacaoOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Upsert do agregado por `id_erp`, em uma transacao — o mesmo desenho do
   * `upsertByCodigoErp` de vendas, com duas diferencas deliberadas.
   *
   * PRESERVA `venda_id`: a projecao e nossa, e ressincronizar o documento nao
   * pode desfaze-la.
   *
   * PRESERVA `recebido_em`: e a PRIMEIRA chegada. E dela que sai a medida do
   * atraso da integracao — carimbar de novo a cada reenvio apagaria o unico
   * numero que responde "quanto tempo o ERP demora a nos contar".
   */
  async sincronizar(
    mov: Movimentacao,
  ): Promise<{ mov: Movimentacao; criada: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const movRepo = manager.getRepository(MovimentacaoOrmEntity);
      const itemRepo = manager.getRepository(MovimentacaoItemOrmEntity);
      const pagRepo = manager.getRepository(MovimentacaoPagamentoOrmEntity);

      const existente = await movRepo.findOne({ where: { idErp: mov.idErp } });

      let movimentacaoId: string;
      let criada: boolean;

      if (existente) {
        await movRepo.update({ id: existente.id }, this.toOrm(mov));
        movimentacaoId = existente.id;
        criada = false;

        // Substitui os filhos. Nao ha chave natural utilizavel para casar
        // linha a linha — ver o cabecalho do port.
        await itemRepo.delete({ movimentacaoId });
        await pagRepo.delete({ movimentacaoId });
      } else {
        const row = movRepo.create(this.toOrm(mov));
        const salvo = await movRepo.save(row);
        movimentacaoId = salvo.id;
        criada = true;
      }

      const itensRows = mov.itens.map((i) =>
        itemRepo.create({ ...this.itemToOrm(i), movimentacaoId }),
      );
      const itensSalvos =
        itensRows.length > 0 ? await itemRepo.save(itensRows) : [];

      const pagsRows = mov.pagamentos.map((p) =>
        pagRepo.create({ ...this.pagamentoToOrm(p), movimentacaoId }),
      );
      const pagsSalvos = pagsRows.length > 0 ? await pagRepo.save(pagsRows) : [];

      const cabecalho = await movRepo.findOneByOrFail({ id: movimentacaoId });
      return {
        mov: this.toDomain(cabecalho, itensSalvos, pagsSalvos),
        criada,
      };
    });
  }

  async buscarPorId(id: string): Promise<Movimentacao | null> {
    const row = await this.repo.findOne({
      where: { id },
      relations: { itens: true, pagamentos: true },
    });
    return row ? this.toDomain(row, row.itens ?? [], row.pagamentos ?? []) : null;
  }

  async buscarPorIdErp(idErp: string): Promise<Movimentacao | null> {
    const row = await this.repo.findOne({
      where: { idErp },
      relations: { itens: true, pagamentos: true },
    });
    return row ? this.toDomain(row, row.itens ?? [], row.pagamentos ?? []) : null;
  }

  async listar(filtros: FiltroMovimentacao): Promise<PaginaMovimentacoes> {
    const where: FindOptionsWhere<MovimentacaoOrmEntity> = {};

    if (filtros.operacaoId) where.operacaoId = filtros.operacaoId;
    if (filtros.clienteId) where.clienteId = filtros.clienteId;
    if (filtros.vendedoraId) where.vendedoraId = filtros.vendedoraId;
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.semVenda) where.vendaId = IsNull();

    if (filtros.de && filtros.ate) {
      where.dataMovimentacao = Between(filtros.de, filtros.ate);
    } else if (filtros.de) {
      where.dataMovimentacao = MoreThanOrEqual(filtros.de);
    } else if (filtros.ate) {
      where.dataMovimentacao = LessThanOrEqual(filtros.ate);
    }

    const limite = Math.min(filtros.limite ?? LIMITE_PADRAO, LIMITE_MAXIMO);
    const offset = filtros.offset ?? 0;

    // SEM `relations`: a listagem devolve `toResumo`, e carregar itens e
    // pagamentos de 50 documentos so para descartar sao duas queries a mais e
    // um payload que ninguem le.
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { dataMovimentacao: 'DESC' },
      take: limite,
      skip: offset,
    });

    return {
      itens: rows.map((r) => this.toDomain(r, [], [])),
      total,
    };
  }

  // -------------------------------------------------------------------------
  // Mapeamento
  // -------------------------------------------------------------------------

  private toOrm(m: Movimentacao): Partial<MovimentacaoOrmEntity> {
    return {
      idErp: m.idErp,
      numero: m.numero,
      dataMovimentacao: m.dataMovimentacao,
      operacaoId: m.operacaoId,
      operacaoIdErp: m.operacaoIdErp,
      empresaId: m.empresaId,
      empresaIdErp: m.empresaIdErp,
      grupoOrigemId: m.grupoOrigemId,
      grupoOrigemIdErp: m.grupoOrigemIdErp,
      grupoDestinoId: m.grupoDestinoId,
      grupoDestinoIdErp: m.grupoDestinoIdErp,
      entidadeOrigemIdErp: m.entidadeOrigemIdErp,
      entidadeDestinoIdErp: m.entidadeDestinoIdErp,
      clienteId: m.clienteId,
      clienteIdErp: m.clienteIdErp,
      vendedoraId: m.vendedoraId,
      vendedoraIdErp: m.vendedoraIdErp,
      valor: m.valor.toFixed(2),
      entrada: m.entrada,
      saida: m.saida,
      ativo: m.ativo,
      // `vendaId` e `recebidoEm` NAO entram: sao nossos e sobrevivem ao
      // reenvio. Ver o cabecalho de `sincronizar`.
    };
  }

  private itemToOrm(i: MovimentacaoItem): Partial<MovimentacaoItemOrmEntity> {
    return {
      nItem: i.nItem,
      idErp: i.idErp,
      produtoId: i.produtoId,
      produtoIdErp: i.produtoIdErp,
      quantidade: i.quantidade.toFixed(4),
      valorUnitario: i.valorUnitario.toFixed(2),
      ativo: i.ativo,
    };
  }

  private pagamentoToOrm(
    p: MovimentacaoPagamento,
  ): Partial<MovimentacaoPagamentoOrmEntity> {
    return {
      idErp: p.idErp,
      nParcela: p.nParcela,
      formaPagamentoId: p.formaPagamentoId,
      formaPagamentoIdErp: p.formaPagamentoIdErp,
      valor: p.valor.toFixed(2),
      debitoCredito: p.debitoCredito,
      ativo: p.ativo,
    };
  }

  private toDomain(
    m: MovimentacaoOrmEntity,
    itens: MovimentacaoItemOrmEntity[],
    pagamentos: MovimentacaoPagamentoOrmEntity[],
  ): Movimentacao {
    return Movimentacao.create({
      id: m.id,
      idErp: m.idErp,
      numero: m.numero,
      dataMovimentacao: m.dataMovimentacao,
      operacaoId: m.operacaoId,
      operacaoIdErp: m.operacaoIdErp,
      empresaId: m.empresaId,
      empresaIdErp: m.empresaIdErp,
      grupoOrigemId: m.grupoOrigemId,
      grupoOrigemIdErp: m.grupoOrigemIdErp,
      grupoDestinoId: m.grupoDestinoId,
      grupoDestinoIdErp: m.grupoDestinoIdErp,
      entidadeOrigemIdErp: m.entidadeOrigemIdErp,
      entidadeDestinoIdErp: m.entidadeDestinoIdErp,
      clienteId: m.clienteId,
      clienteIdErp: m.clienteIdErp,
      vendedoraId: m.vendedoraId,
      vendedoraIdErp: m.vendedoraIdErp,
      // DECIMAL volta do driver como texto, para nao perder precisao.
      valor: Number(m.valor),
      entrada: m.entrada,
      saida: m.saida,
      ativo: m.ativo,
      vendaId: m.vendaId,
      recebidoEm: m.recebidoEm,
      criadoEm: m.criadoEm,
      atualizadoEm: m.atualizadoEm,
      itens: itens
        .map((i) =>
          MovimentacaoItem.create({
            id: i.id,
            nItem: i.nItem,
            idErp: i.idErp,
            produtoId: i.produtoId,
            produtoIdErp: i.produtoIdErp,
            quantidade: Number(i.quantidade),
            valorUnitario: Number(i.valorUnitario),
            ativo: i.ativo,
          }),
        )
        .sort((a, b) => a.nItem - b.nItem),
      pagamentos: pagamentos.map((p) =>
        MovimentacaoPagamento.create({
          id: p.id,
          idErp: p.idErp,
          nParcela: p.nParcela,
          formaPagamentoId: p.formaPagamentoId,
          formaPagamentoIdErp: p.formaPagamentoIdErp,
          valor: Number(p.valor),
          debitoCredito: p.debitoCredito,
          ativo: p.ativo,
        }),
      ),
    });
  }
}
