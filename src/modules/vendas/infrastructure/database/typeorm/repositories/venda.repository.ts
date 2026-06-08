import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ItemVenda } from '../../../../domain/entities/item-venda.entity';
import { PagamentoVenda } from '../../../../domain/entities/pagamento-venda.entity';
import { Venda } from '../../../../domain/entities/venda.entity';
import {
  FiltroVenda,
  IVendaRepository,
} from '../../../../domain/ports/repositories/venda-repository.port';
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
