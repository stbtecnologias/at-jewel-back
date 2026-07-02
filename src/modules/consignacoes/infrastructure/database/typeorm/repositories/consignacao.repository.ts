import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Consignacao } from '../../../../domain/entities/consignacao.entity';
import type {
  DestinoConsignacao,
  StatusConsignacao,
} from '../../../../domain/entities/enums';
import type {
  AtualizarConsignacaoData,
  ConsignacaoItem,
  FiltroConsignacao,
  IConsignacaoRepository,
  ListaConsignacoes,
  ResumoConsignacoes,
} from '../../../../domain/ports/repositories/consignacao-repository.port';
import { ConsignacaoOrmEntity } from '../entities/consignacao.orm-entity';

// Limites de paginacao para conter abuso e custo de query.
const LIMIT_PADRAO = 50;
const LIMIT_MAXIMO = 200;

// Read-model achatado devolvido pelas queries SQL de leitura.
interface LinhaConsignacao {
  id: string;
  produto_id: string;
  produto_nome: string | null;
  quantidade: number;
  destino_tipo: DestinoConsignacao;
  cliente_id: string | null;
  cliente_nome: string | null;
  vendedora_id: string | null;
  vendedora_nome: string | null;
  status: StatusConsignacao;
  data_saida: Date;
  data_prevista_retorno: Date | string | null;
  data_retorno: Date | null;
  observacao: string | null;
  criado_em: Date;
}

// Cascata de nome do produto reaproveitada do modulo de vendas
// (produtos nao tem coluna `nome`: usa descricao_etiqueta -> codigo_erp
// -> categoria+familia -> prefixo do uuid). clientes.nome e vendedoras.nome
// sao plaintext nas migracoes 03/04, entao o JOIN em SQL e seguro (nao
// ha coluna cifrada por transformer a decriptar aqui).
const SELECT_ITEM = `
  SELECT
    c.id,
    c.produto_id,
    COALESCE(
      NULLIF(p.descricao_etiqueta, ''),
      p.codigo_erp,
      p.categoria || ' ' || p.familia,
      LEFT(c.produto_id::text, 8)
    ) AS produto_nome,
    c.quantidade,
    c.destino_tipo,
    c.cliente_id,
    cl.nome AS cliente_nome,
    c.vendedora_id,
    vd.nome AS vendedora_nome,
    c.status,
    c.data_saida,
    c.data_prevista_retorno,
    c.data_retorno,
    c.observacao,
    c.criado_em
  FROM consignacoes c
  LEFT JOIN produtos p ON p.id = c.produto_id
  LEFT JOIN clientes cl ON cl.id = c.cliente_id
  LEFT JOIN vendedoras vd ON vd.id = c.vendedora_id
`;

@Injectable()
export class ConsignacaoRepository implements IConsignacaoRepository {
  constructor(
    @InjectRepository(ConsignacaoOrmEntity)
    private readonly repo: Repository<ConsignacaoOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async criar(consignacao: Consignacao): Promise<Consignacao> {
    const entity = this.repo.create(this.toOrm(consignacao));
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async listar(filtro: FiltroConsignacao): Promise<ListaConsignacoes> {
    const { where, params } = this.montarWhere(filtro);

    const limit = Math.min(filtro.limit ?? LIMIT_PADRAO, LIMIT_MAXIMO);
    const offset = filtro.offset ?? 0;

    const listaParams = [...params];
    listaParams.push(limit);
    const limitIdx = listaParams.length;
    listaParams.push(offset);
    const offsetIdx = listaParams.length;

    const linhas = await this.dataSource.query<LinhaConsignacao[]>(
      `${SELECT_ITEM}
      ${where}
      ORDER BY c.data_saida DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listaParams,
    );

    const totalRows = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::int AS total FROM consignacoes c ${where}`,
      params,
    );
    const total = Number(totalRows[0]?.total ?? 0);

    return { itens: linhas.map((l) => this.linhaToItem(l)), total };
  }

  async buscarItemPorId(id: string): Promise<ConsignacaoItem | null> {
    const linhas = await this.dataSource.query<LinhaConsignacao[]>(
      `${SELECT_ITEM} WHERE c.id = $1 LIMIT 1`,
      [id],
    );
    return linhas[0] ? this.linhaToItem(linhas[0]) : null;
  }

  async buscarPorId(id: string): Promise<Consignacao | null> {
    const row = await this.repo.findOneBy({ id });
    return row ? this.toDomain(row) : null;
  }

  async atualizar(id: string, dados: AtualizarConsignacaoData): Promise<ConsignacaoItem> {
    const patch: Partial<ConsignacaoOrmEntity> = {};
    if (dados.status !== undefined) patch.status = dados.status;
    if (dados.dataRetorno !== undefined) patch.dataRetorno = dados.dataRetorno;
    if (dados.observacao !== undefined) patch.observacao = dados.observacao;

    if (Object.keys(patch).length > 0) {
      await this.repo.update(id, patch);
    }

    const item = await this.buscarItemPorId(id);
    if (!item) throw new Error('Consignacao nao encontrada apos atualizacao');
    return item;
  }

  async resumo(): Promise<ResumoConsignacoes> {
    // Todos os agregados das ABERTAS numa unica varredura via FILTER.
    // valor_estimado = SUM(quantidade * produtos.valor_venda).
    const rows = await this.dataSource.query<
      { abertas: string; pecas_fora: string; valor_estimado: string }[]
    >(
      `
      SELECT
        COUNT(*) FILTER (WHERE c.status = 'ABERTA')::int AS abertas,
        COALESCE(SUM(c.quantidade) FILTER (WHERE c.status = 'ABERTA'), 0)::int AS pecas_fora,
        COALESCE(SUM(c.quantidade * p.valor_venda) FILTER (WHERE c.status = 'ABERTA'), 0)::float AS valor_estimado
      FROM consignacoes c
      LEFT JOIN produtos p ON p.id = c.produto_id
      `,
    );
    const r = rows[0];
    return {
      abertas: Number(r?.abertas ?? 0),
      pecasFora: Number(r?.pecas_fora ?? 0),
      valorEstimado: Number(r?.valor_estimado ?? 0),
    };
  }

  private montarWhere(filtro: FiltroConsignacao): { where: string; params: unknown[] } {
    const conds: string[] = [];
    const params: unknown[] = [];

    if (filtro.status !== undefined) {
      params.push(filtro.status);
      conds.push(`c.status = $${params.length}`);
    }
    if (filtro.destinoTipo !== undefined) {
      params.push(filtro.destinoTipo);
      conds.push(`c.destino_tipo = $${params.length}`);
    }
    if (filtro.produtoId !== undefined) {
      params.push(filtro.produtoId);
      conds.push(`c.produto_id = $${params.length}`);
    }
    if (filtro.dataDe !== undefined) {
      params.push(filtro.dataDe);
      conds.push(`c.data_saida >= $${params.length}`);
    }
    if (filtro.dataAte !== undefined) {
      params.push(filtro.dataAte);
      conds.push(`c.data_saida <= $${params.length}`);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    return { where, params };
  }

  private linhaToItem(l: LinhaConsignacao): ConsignacaoItem {
    return {
      id: l.id,
      produtoId: l.produto_id,
      produtoNome: l.produto_nome,
      quantidade: Number(l.quantidade),
      destinoTipo: l.destino_tipo,
      clienteId: l.cliente_id,
      clienteNome: l.cliente_nome,
      vendedoraId: l.vendedora_id,
      vendedoraNome: l.vendedora_nome,
      status: l.status,
      dataSaida: l.data_saida,
      dataPrevistaRetorno: this.paraData(l.data_prevista_retorno),
      dataRetorno: l.data_retorno,
      observacao: l.observacao,
      createdAt: l.criado_em,
    };
  }

  // Postgres pode devolver colunas DATE como string 'YYYY-MM-DD'.
  private paraData(valor: Date | string | null): Date | null {
    if (valor == null) return null;
    return valor instanceof Date ? valor : new Date(valor);
  }

  private toOrm(c: Consignacao): Partial<ConsignacaoOrmEntity> {
    return {
      ...(c.id ? { id: c.id } : {}),
      produtoId: c.produtoId,
      quantidade: c.quantidade,
      destinoTipo: c.destinoTipo,
      clienteId: c.clienteId,
      vendedoraId: c.vendedoraId,
      status: c.status,
      ...(c.dataSaida ? { dataSaida: c.dataSaida } : {}),
      dataPrevistaRetorno: c.dataPrevistaRetorno,
      dataRetorno: c.dataRetorno,
      observacao: c.observacao,
      criadoPor: c.criadoPor,
    };
  }

  private toDomain(o: ConsignacaoOrmEntity): Consignacao {
    return Consignacao.create({
      id: o.id,
      produtoId: o.produtoId,
      quantidade: Number(o.quantidade),
      destinoTipo: o.destinoTipo,
      clienteId: o.clienteId,
      vendedoraId: o.vendedoraId,
      status: o.status,
      dataSaida: o.dataSaida,
      dataPrevistaRetorno: this.paraData(o.dataPrevistaRetorno as unknown as Date | string | null),
      dataRetorno: o.dataRetorno,
      observacao: o.observacao,
      criadoPor: o.criadoPor,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
