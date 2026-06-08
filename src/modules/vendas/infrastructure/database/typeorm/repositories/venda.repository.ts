import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ItemVenda } from '../../../../domain/entities/item-venda.entity';
import { PagamentoVenda } from '../../../../domain/entities/pagamento-venda.entity';
import { Venda } from '../../../../domain/entities/venda.entity';
import {
  FiltroVenda,
  HistoricoCliente,
  IVendaRepository,
  ItemHistoricoCliente,
  ResumoVendas,
} from '../../../../domain/ports/repositories/venda-repository.port';
import type { StatusVenda } from '../../../../domain/entities/enums';
import { ItemVendaOrmEntity } from '../entities/item-venda.orm-entity';
import { PagamentoVendaOrmEntity } from '../entities/pagamento-venda.orm-entity';
import { VendaOrmEntity } from '../entities/venda.orm-entity';

// Limites de paginacao para conter abuso e custo de query.
const LIMIT_PADRAO = 50;
const LIMIT_MAXIMO = 200;

@Injectable()
export class VendaRepository implements IVendaRepository {
  constructor(
    @InjectRepository(VendaOrmEntity)
    private readonly repo: Repository<VendaOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async criarComAgregado(venda: Venda): Promise<Venda> {
    return this.dataSource.transaction(async (manager) => {
      const vendaRepo = manager.getRepository(VendaOrmEntity);
      const itemRepo = manager.getRepository(ItemVendaOrmEntity);
      const pagamentoRepo = manager.getRepository(PagamentoVendaOrmEntity);

      const vendaRow = vendaRepo.create(this.toOrm(venda));
      const vendaSalva = await vendaRepo.save(vendaRow);

      const itensRows = venda.itens.map((i) =>
        itemRepo.create({ ...this.itemToOrm(i), vendaId: vendaSalva.id }),
      );
      const itensSalvos = itensRows.length > 0 ? await itemRepo.save(itensRows) : [];

      const pagamentosRows = venda.pagamentos.map((p) =>
        pagamentoRepo.create({ ...this.pagamentoToOrm(p), vendaId: vendaSalva.id }),
      );
      const pagamentosSalvos =
        pagamentosRows.length > 0 ? await pagamentoRepo.save(pagamentosRows) : [];

      return this.toDomain(vendaSalva, itensSalvos, pagamentosSalvos);
    });
  }

  async upsertByCodigoErp(venda: Venda): Promise<Venda> {
    if (!venda.codigoErp) {
      // Salvaguarda: upsert por codigo_erp exige a chave natural. Sem ela
      // nao ha como decidir entre criar e atualizar.
      throw new Error('upsertByCodigoErp requer codigoErp definido');
    }
    const codigoErp = venda.codigoErp;

    return this.dataSource.transaction(async (manager) => {
      const vendaRepo = manager.getRepository(VendaOrmEntity);
      const itemRepo = manager.getRepository(ItemVendaOrmEntity);
      const pagamentoRepo = manager.getRepository(PagamentoVendaOrmEntity);

      const existente = await vendaRepo.findOne({ where: { codigoErp } });

      let vendaId: string;
      if (existente) {
        // Atualiza o header preservando o id. Substitui os filhos: apaga e
        // recria a partir do payload mais recente do ERP.
        await vendaRepo.update({ id: existente.id }, this.toOrm(venda));
        vendaId = existente.id;
        await itemRepo.delete({ vendaId });
        await pagamentoRepo.delete({ vendaId });
      } else {
        const vendaRow = vendaRepo.create(this.toOrm(venda));
        const vendaSalva = await vendaRepo.save(vendaRow);
        vendaId = vendaSalva.id;
      }

      const itensRows = venda.itens.map((i) =>
        itemRepo.create({ ...this.itemToOrm(i), vendaId }),
      );
      const itensSalvos =
        itensRows.length > 0 ? await itemRepo.save(itensRows) : [];

      const pagamentosRows = venda.pagamentos.map((p) =>
        pagamentoRepo.create({ ...this.pagamentoToOrm(p), vendaId }),
      );
      const pagamentosSalvos =
        pagamentosRows.length > 0 ? await pagamentoRepo.save(pagamentosRows) : [];

      const vendaSalva = await vendaRepo.findOneByOrFail({ id: vendaId });
      return this.toDomain(vendaSalva, itensSalvos, pagamentosSalvos);
    });
  }

  async buscarPorId(
    id: string,
    opts?: { incluirAgregado?: boolean },
  ): Promise<Venda | null> {
    const row = await this.repo.findOne({
      where: { id },
      relations: opts?.incluirAgregado ? { itens: true, pagamentos: true } : {},
    });
    if (!row) return null;
    return this.toDomain(row, row.itens, row.pagamentos);
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<Venda | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroVenda): Promise<Venda[]> {
    const qb = this.repo.createQueryBuilder('v');

    if (filtros.dataDe !== undefined) {
      qb.andWhere('v.data_venda >= :dataDe', { dataDe: filtros.dataDe });
    }
    if (filtros.dataAte !== undefined) {
      qb.andWhere('v.data_venda <= :dataAte', { dataAte: filtros.dataAte });
    }
    if (filtros.clienteId !== undefined) {
      qb.andWhere('v.cliente_id = :clienteId', { clienteId: filtros.clienteId });
    }
    if (filtros.vendedoraId !== undefined) {
      qb.andWhere('v.vendedora_id = :vendedoraId', { vendedoraId: filtros.vendedoraId });
    }
    if (filtros.status !== undefined) {
      qb.andWhere('v.status = :status', { status: filtros.status });
    }

    const limit = Math.min(filtros.limit ?? LIMIT_PADRAO, LIMIT_MAXIMO);
    const offset = filtros.offset ?? 0;

    qb.orderBy('v.data_venda', 'DESC').take(limit).skip(offset);

    const rows = await qb.getMany();
    return rows.map((r) => this.toDomain(r));
  }

  async listarVendedoraIdsPorCliente(clienteId: string): Promise<string[]> {
    // Apenas vendas concluidas e ativas contam como relacionamento previo.
    // Seleciona somente a FK distinta da vendedora — nenhum dado de venda
    // nem PII do cliente trafega. clienteId vem parametrizado.
    const rows = await this.repo
      .createQueryBuilder('v')
      .select('DISTINCT v.vendedora_id', 'vendedora_id')
      .where('v.cliente_id = :clienteId', { clienteId })
      .andWhere('v.status = :status', { status: 'concluida' })
      .andWhere('v.ativo = true')
      .andWhere('v.vendedora_id IS NOT NULL')
      .getRawMany<{ vendedora_id: string }>();
    return rows.map((r) => r.vendedora_id);
  }

  async resumoAgregado(filtros: FiltroVenda): Promise<ResumoVendas> {
    // Tudo agregado em SQL: nenhuma venda e carregada na memoria.
    //
    // Receita e contagem de vendas vem de uma query SEM join (para nao inflar
    // a soma de valor_total). A soma de itens vem de uma query com INNER JOIN
    // em itens_venda. A distribuicao por status vem de uma terceira query
    // agrupada. Quando `status` e informado, o recorte de receita/itens passa
    // a usar aquele status no lugar do 'concluida' padrao.
    const statusReceita: StatusVenda = filtros.status ?? 'concluida';

    const aggParams: Record<string, unknown> = { status: statusReceita };
    const aggConds: string[] = ['v.ativo = true', 'v.status = :status'];
    if (filtros.dataDe !== undefined) {
      aggConds.push('v.data_venda >= :dataDe');
      aggParams.dataDe = filtros.dataDe;
    }
    if (filtros.dataAte !== undefined) {
      aggConds.push('v.data_venda <= :dataAte');
      aggParams.dataAte = filtros.dataAte;
    }
    if (filtros.vendedoraId !== undefined) {
      aggConds.push('v.vendedora_id = :vendedoraId');
      aggParams.vendedoraId = filtros.vendedoraId;
    }

    const receitaRow = await this.repo
      .createQueryBuilder('v')
      .select('COUNT(v.id)', 'total_vendas')
      .addSelect('COALESCE(SUM(v.valor_total), 0)', 'receita_total')
      .where(aggConds.join(' AND '), aggParams)
      .getRawOne<{ total_vendas: string; receita_total: string }>();

    const itensRow = await this.repo
      .createQueryBuilder('v')
      .innerJoin('itens_venda', 'iv', 'iv.venda_id = v.id')
      .select('COALESCE(SUM(iv.quantidade), 0)', 'total_itens')
      .where(aggConds.join(' AND '), aggParams)
      .getRawOne<{ total_itens: string }>();

    const totalVendas = Number(receitaRow?.total_vendas ?? 0);
    const receitaTotal = Number(receitaRow?.receita_total ?? 0);
    const totalItens = Number(itensRow?.total_itens ?? 0);
    const ticketMedio = totalVendas > 0 ? receitaTotal / totalVendas : 0;

    // Contagem por status sobre vendas ATIVAS do recorte (periodo/vendedora),
    // sem aplicar o filtro de status (queremos a distribuicao completa).
    const statusParams: Record<string, unknown> = {};
    const statusConds: string[] = ['v.ativo = true'];
    if (filtros.dataDe !== undefined) {
      statusConds.push('v.data_venda >= :dataDe');
      statusParams.dataDe = filtros.dataDe;
    }
    if (filtros.dataAte !== undefined) {
      statusConds.push('v.data_venda <= :dataAte');
      statusParams.dataAte = filtros.dataAte;
    }
    if (filtros.vendedoraId !== undefined) {
      statusConds.push('v.vendedora_id = :vendedoraId');
      statusParams.vendedoraId = filtros.vendedoraId;
    }

    const statusRows = await this.repo
      .createQueryBuilder('v')
      .select('v.status', 'status')
      .addSelect('COUNT(v.id)', 'total')
      .where(statusConds.join(' AND '), statusParams)
      .groupBy('v.status')
      .getRawMany<{ status: StatusVenda; total: string }>();

    const porStatus = { concluida: 0, cancelada: 0, pendente: 0 };
    for (const r of statusRows) {
      if (r.status in porStatus) {
        porStatus[r.status] = Number(r.total);
      }
    }

    return {
      totalVendas,
      receitaTotal,
      ticketMedio,
      totalItens,
      porStatus,
    };
  }

  async listarHistoricoPorCliente(
    clienteId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<HistoricoCliente> {
    const limit = Math.min(opts?.limit ?? LIMIT_PADRAO, LIMIT_MAXIMO);
    const offset = opts?.offset ?? 0;

    // Lista de vendas do cliente (todos os status) com a contagem de itens
    // resolvida no proprio SELECT via subquery correlacionada — evita N+1.
    // Apenas FK de vendedora e dados de venda; nenhuma PII do cliente.
    const linhas = await this.repo
      .createQueryBuilder('v')
      .select('v.id', 'id')
      .addSelect('v.data_venda', 'data_venda')
      .addSelect('v.valor_total', 'valor_total')
      .addSelect('v.status', 'status')
      .addSelect('v.vendedora_id', 'vendedora_id')
      .addSelect(
        '(SELECT COUNT(*) FROM itens_venda iv WHERE iv.venda_id = v.id)',
        'qtd_itens',
      )
      .where('v.cliente_id = :clienteId', { clienteId })
      .andWhere('v.ativo = true')
      .orderBy('v.data_venda', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany<{
        id: string;
        data_venda: Date;
        valor_total: string;
        status: StatusVenda;
        vendedora_id: string | null;
        qtd_itens: string;
      }>();

    const vendas: ItemHistoricoCliente[] = linhas.map((l) => ({
      id: l.id,
      dataVenda: l.data_venda,
      valorTotal: Number(l.valor_total),
      status: l.status,
      vendedoraId: l.vendedora_id,
      qtdItens: Number(l.qtd_itens),
    }));

    // Resumo agregado sobre TODO o historico concluido (independente da
    // paginacao da lista). Calculado em SQL.
    const resumoRow = await this.repo
      .createQueryBuilder('v')
      .select('COUNT(v.id)', 'total_compras')
      .addSelect('COALESCE(SUM(v.valor_total), 0)', 'valor_total')
      .addSelect('MAX(v.data_venda)', 'ultima_compra_em')
      .where('v.cliente_id = :clienteId', { clienteId })
      .andWhere('v.ativo = true')
      .andWhere("v.status = 'concluida'")
      .getRawOne<{
        total_compras: string;
        valor_total: string;
        ultima_compra_em: Date | null;
      }>();

    const totalCompras = Number(resumoRow?.total_compras ?? 0);
    const valorTotal = Number(resumoRow?.valor_total ?? 0);
    const ticketMedio = totalCompras > 0 ? valorTotal / totalCompras : 0;
    const ultimaCompraEm = resumoRow?.ultima_compra_em ?? null;

    return {
      resumo: {
        totalCompras,
        valorTotal,
        ticketMedio,
        ultimaCompraEm,
      },
      vendas,
    };
  }

  // Postgres retorna DECIMAL como string. Converte preservando null.
  private numeroOuNull(valor: string | null): number | null {
    return valor != null ? Number(valor) : null;
  }

  private toOrm(v: Venda): Partial<VendaOrmEntity> {
    return {
      codigoErp: v.codigoErp,
      clienteId: v.clienteId,
      vendedoraId: v.vendedoraId,
      dataVenda: v.dataVenda,
      dataContato: v.dataContato,
      valorBruto: v.valorBruto.toString(),
      valorDesconto: v.valorDesconto.toString(),
      valorTotal: v.valorTotal.toString(),
      status: v.status,
      observacao: v.observacao,
      ativo: v.ativo,
    };
  }

  private itemToOrm(i: ItemVenda): Partial<ItemVendaOrmEntity> {
    return {
      produtoId: i.produtoId,
      codigoErpItem: i.codigoErpItem,
      quantidade: i.quantidade.toString(),
      valorUnitario: i.valorUnitario.toString(),
      valorCustoUnitario: i.valorCustoUnitario != null ? i.valorCustoUnitario.toString() : null,
      valorDescontoItem: i.valorDescontoItem.toString(),
      valorTotalItem: i.valorTotalItem.toString(),
    };
  }

  private pagamentoToOrm(p: PagamentoVenda): Partial<PagamentoVendaOrmEntity> {
    return {
      formaPagamento: p.formaPagamento,
      valor: p.valor.toString(),
      parcelas: p.parcelas,
      valorParcela: p.valorParcela != null ? p.valorParcela.toString() : null,
      bandeira: p.bandeira,
      dataPagamento: p.dataPagamento,
    };
  }

  private toDomain(
    v: VendaOrmEntity,
    itensRows?: ItemVendaOrmEntity[] | null,
    pagamentosRows?: PagamentoVendaOrmEntity[] | null,
  ): Venda {
    return Venda.create({
      id: v.id,
      codigoErp: v.codigoErp,
      clienteId: v.clienteId,
      vendedoraId: v.vendedoraId,
      dataVenda: v.dataVenda,
      dataContato: v.dataContato,
      valorBruto: Number(v.valorBruto),
      valorDesconto: Number(v.valorDesconto),
      valorTotal: Number(v.valorTotal),
      status: v.status,
      observacao: v.observacao,
      ativo: v.ativo,
      criadoEm: v.criadoEm,
      atualizadoEm: v.atualizadoEm,
      itens: (itensRows ?? []).map((i) => this.itemToDomain(i)),
      pagamentos: (pagamentosRows ?? []).map((p) => this.pagamentoToDomain(p)),
    });
  }

  private itemToDomain(i: ItemVendaOrmEntity): ItemVenda {
    return ItemVenda.create({
      id: i.id,
      vendaId: i.vendaId,
      produtoId: i.produtoId,
      codigoErpItem: i.codigoErpItem,
      quantidade: Number(i.quantidade),
      valorUnitario: Number(i.valorUnitario),
      valorCustoUnitario: this.numeroOuNull(i.valorCustoUnitario),
      valorDescontoItem: Number(i.valorDescontoItem),
      valorTotalItem: Number(i.valorTotalItem),
      criadoEm: i.criadoEm,
      atualizadoEm: i.atualizadoEm,
    });
  }

  private pagamentoToDomain(p: PagamentoVendaOrmEntity): PagamentoVenda {
    return PagamentoVenda.create({
      id: p.id,
      vendaId: p.vendaId,
      formaPagamento: p.formaPagamento,
      valor: Number(p.valor),
      parcelas: p.parcelas,
      valorParcela: this.numeroOuNull(p.valorParcela),
      bandeira: p.bandeira,
      dataPagamento: p.dataPagamento,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    });
  }
}
