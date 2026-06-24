import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ItemVenda } from '../../../../domain/entities/item-venda.entity';
import { PagamentoVenda } from '../../../../domain/entities/pagamento-venda.entity';
import { Venda } from '../../../../domain/entities/venda.entity';
import {
  ComparativoVendedora,
  FiltroVenda,
  HistoricoCliente,
  IVendaRepository,
  ItemHistoricoCliente,
  ResumoVendas,
  VendaResumo,
} from '../../../../domain/ports/repositories/venda-repository.port';
import type { FormaPagamento, StatusVenda } from '../../../../domain/entities/enums';
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

  async listar(filtros: FiltroVenda): Promise<VendaResumo[]> {
    // Read-model achatado montado inteiramente em SQL. Os subSELECTs laterais
    // resolvem produto principal (item de maior valor), contagem de itens e
    // formas de pagamento distintas sem N+1. Parametros sao posicionais ($n)
    // para evitar qualquer injecao. O nome do produto reusa a mesma cascata de
    // COALESCE do analytics (descricao_etiqueta -> codigo_erp -> categoria+familia).
    const conds: string[] = [];
    const params: unknown[] = [];

    if (filtros.dataDe !== undefined) {
      params.push(filtros.dataDe);
      conds.push(`v.data_venda >= $${params.length}`);
    }
    if (filtros.dataAte !== undefined) {
      params.push(filtros.dataAte);
      conds.push(`v.data_venda <= $${params.length}`);
    }
    if (filtros.clienteId !== undefined) {
      params.push(filtros.clienteId);
      conds.push(`v.cliente_id = $${params.length}`);
    }
    if (filtros.vendedoraId !== undefined) {
      params.push(filtros.vendedoraId);
      conds.push(`v.vendedora_id = $${params.length}`);
    }
    if (filtros.status !== undefined) {
      params.push(filtros.status);
      conds.push(`v.status = $${params.length}`);
    }
    if (filtros.formaPagamento !== undefined) {
      params.push(filtros.formaPagamento);
      conds.push(
        `EXISTS (SELECT 1 FROM pagamentos_venda pvf WHERE pvf.venda_id = v.id AND pvf.forma_pagamento = $${params.length})`,
      );
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';

    const limit = Math.min(filtros.limit ?? LIMIT_PADRAO, LIMIT_MAXIMO);
    const offset = filtros.offset ?? 0;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const rows = await this.dataSource.query<
      {
        id: string;
        codigo_erp: string | null;
        cliente_id: string | null;
        vendedora_id: string | null;
        vendedora_nome: string | null;
        data_venda: Date;
        data_contato: Date | null;
        valor_bruto: string;
        valor_desconto: string;
        valor_total: string;
        status: StatusVenda;
        ativo: boolean;
        produto_principal: string | null;
        qtd_itens: number;
        formas_pagamento: FormaPagamento[] | null;
        criado_em: Date;
        atualizado_em: Date;
      }[]
    >(
      `
      SELECT
        v.id,
        v.codigo_erp,
        v.cliente_id,
        v.vendedora_id,
        vd.nome AS vendedora_nome,
        v.data_venda,
        v.data_contato,
        v.valor_bruto,
        v.valor_desconto,
        v.valor_total,
        v.status,
        v.ativo,
        prin.nome AS produto_principal,
        COALESCE(qi.qtd, 0) AS qtd_itens,
        fp.formas AS formas_pagamento,
        v.criado_em,
        v.atualizado_em
      FROM vendas v
      LEFT JOIN vendedoras vd ON vd.id = v.vendedora_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
                 NULLIF(p.descricao_etiqueta, ''),
                 p.codigo_erp,
                 p.categoria || ' ' || p.familia,
                 LEFT(iv.produto_id::text, 8)
               ) AS nome
        FROM itens_venda iv
        LEFT JOIN produtos p ON p.id = iv.produto_id
        WHERE iv.venda_id = v.id
        ORDER BY iv.valor_total_item DESC
        LIMIT 1
      ) prin ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS qtd FROM itens_venda iv WHERE iv.venda_id = v.id
      ) qi ON true
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT pv.forma_pagamento::text ORDER BY pv.forma_pagamento::text) AS formas
        FROM pagamentos_venda pv WHERE pv.venda_id = v.id
      ) fp ON true
      ${where}
      ORDER BY v.data_venda DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      params,
    );

    return rows.map((r) => ({
      id: r.id,
      codigoErp: r.codigo_erp,
      clienteId: r.cliente_id,
      vendedoraId: r.vendedora_id,
      vendedoraNome: r.vendedora_nome,
      dataVenda: r.data_venda,
      dataContato: r.data_contato,
      valorBruto: Number(r.valor_bruto),
      valorDesconto: Number(r.valor_desconto),
      valorTotal: Number(r.valor_total),
      status: r.status,
      ativo: r.ativo,
      produtoPrincipal: r.produto_principal,
      qtdItens: Number(r.qtd_itens),
      formasPagamento: (r.formas_pagamento ?? []) as FormaPagamento[],
      criadoEm: r.criado_em,
      atualizadoEm: r.atualizado_em,
    }));
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

  async resolverVendedoraIdPorAdminUser(
    adminUserId: string,
  ): Promise<string | null> {
    // Vinculo usuario->vendedora (RF-USU-02). Parametrizado; retorna so a FK.
    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM vendedoras WHERE admin_user_id = $1 LIMIT 1`,
      [adminUserId],
    );
    return rows[0]?.id ?? null;
  }

  async comparativoPorVendedora(
    filtros: Pick<FiltroVenda, 'dataDe' | 'dataAte'>,
  ): Promise<ComparativoVendedora[]> {
    // Agregado por vendedora de vendas CONCLUIDAS e ativas (RF-USU-02). Sem
    // carregar linhas; periodo opcional parametrizado. Nenhuma PII.
    const conds: string[] = [`v.status = 'concluida'`, `v.ativo = true`];
    const params: unknown[] = [];
    if (filtros.dataDe !== undefined) {
      params.push(filtros.dataDe);
      conds.push(`v.data_venda >= $${params.length}`);
    }
    if (filtros.dataAte !== undefined) {
      params.push(filtros.dataAte);
      conds.push(`v.data_venda <= $${params.length}`);
    }
    const rows = await this.dataSource.query<
      {
        vendedoraId: string | null;
        vendedoraNome: string | null;
        totalVendas: number;
        receita: number;
        ticketMedio: number;
      }[]
    >(
      `
      SELECT v.vendedora_id AS "vendedoraId",
             vd.nome AS "vendedoraNome",
             COUNT(*)::int AS "totalVendas",
             COALESCE(SUM(v.valor_total), 0)::float AS receita,
             COALESCE(AVG(v.valor_total), 0)::float AS "ticketMedio"
      FROM vendas v
      LEFT JOIN vendedoras vd ON vd.id = v.vendedora_id
      WHERE ${conds.join(' AND ')}
      GROUP BY v.vendedora_id, vd.nome
      ORDER BY receita DESC
      `,
      params,
    );
    return rows.map((r) => ({
      vendedoraId: r.vendedoraId,
      vendedoraNome: r.vendedoraNome,
      totalVendas: r.totalVendas,
      receita: r.receita,
      ticketMedio: r.ticketMedio,
    }));
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
