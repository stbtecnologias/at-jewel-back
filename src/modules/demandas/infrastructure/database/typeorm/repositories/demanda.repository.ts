import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Demanda } from '../../../../domain/entities/demanda.entity';
import type {
  CanalDemanda,
  StatusDemanda,
  TipoDemanda,
} from '../../../../domain/entities/enums';
import type {
  AtualizarDemandaData,
  DemandaItem,
  FiltroDemanda,
  IDemandaRepository,
  KpisDemandas,
  ListaDemandas,
} from '../../../../domain/ports/repositories/demanda-repository.port';
import { DemandaOrmEntity } from '../entities/demanda.orm-entity';

// Limites de paginacao para conter abuso e custo de query.
const LIMIT_PADRAO = 50;
const LIMIT_MAXIMO = 200;

// Read-model achatado devolvido pelas queries SQL de leitura.
interface LinhaDemanda {
  id: string;
  solicitante_nome: string;
  canal: CanalDemanda;
  tipo: TipoDemanda;
  descricao: string;
  status: StatusDemanda;
  resposta: string | null;
  created_at: Date;
  updated_at: Date;
  concluida_em: Date | null;
}

const SELECT_ITEM = `
  SELECT
    d.id,
    d.solicitante_nome,
    d.canal,
    d.tipo,
    d.descricao,
    d.status,
    d.resposta,
    d.created_at,
    d.updated_at,
    d.concluida_em
  FROM demandas d
`;

@Injectable()
export class DemandaRepository implements IDemandaRepository {
  constructor(
    @InjectRepository(DemandaOrmEntity)
    private readonly repo: Repository<DemandaOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async criar(demanda: Demanda): Promise<Demanda> {
    const entity = this.repo.create(this.toOrm(demanda));
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async listar(filtro: FiltroDemanda): Promise<ListaDemandas> {
    const { where, params } = this.montarWhere(filtro);

    const limit = Math.min(filtro.limit ?? LIMIT_PADRAO, LIMIT_MAXIMO);
    const offset = filtro.offset ?? 0;

    const listaParams = [...params];
    listaParams.push(limit);
    const limitIdx = listaParams.length;
    listaParams.push(offset);
    const offsetIdx = listaParams.length;

    const linhas = await this.dataSource.query<LinhaDemanda[]>(
      `${SELECT_ITEM}
      ${where}
      ORDER BY d.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listaParams,
    );

    const totalRows = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::int AS total FROM demandas d ${where}`,
      params,
    );
    const total = Number(totalRows[0]?.total ?? 0);

    return { itens: linhas.map((l) => this.linhaToItem(l)), total };
  }

  async buscarItemPorId(id: string): Promise<DemandaItem | null> {
    const linhas = await this.dataSource.query<LinhaDemanda[]>(
      `${SELECT_ITEM} WHERE d.id = $1 LIMIT 1`,
      [id],
    );
    return linhas[0] ? this.linhaToItem(linhas[0]) : null;
  }

  async buscarPorId(id: string): Promise<Demanda | null> {
    const row = await this.repo.findOneBy({ id });
    return row ? this.toDomain(row) : null;
  }

  async atualizar(id: string, dados: AtualizarDemandaData): Promise<DemandaItem> {
    const patch: Partial<DemandaOrmEntity> = {};
    if (dados.status !== undefined) patch.status = dados.status;
    if (dados.resposta !== undefined) patch.resposta = dados.resposta;
    if (dados.concluidaEm !== undefined) patch.concluidaEm = dados.concluidaEm;

    if (Object.keys(patch).length > 0) {
      await this.repo.update(id, patch);
    }

    const item = await this.buscarItemPorId(id);
    if (!item) throw new Error('Demanda nao encontrada apos atualizacao');
    return item;
  }

  async kpis(solicitanteUserId?: string): Promise<KpisDemandas> {
    const params: unknown[] = [];
    let where = '';
    if (solicitanteUserId !== undefined) {
      params.push(solicitanteUserId);
      where = `WHERE d.solicitante_user_id = $${params.length}`;
    }
    // Contadores de estado + concluidas nos ultimos 30 dias, tudo numa
    // varredura via FILTER. tempo_medio_horas = media de
    // (concluida_em - created_at) das CONCLUIDAS dos ultimos 90 dias,
    // em horas com 1 casa decimal (0 quando nao ha amostra).
    const rows = await this.dataSource.query<
      {
        abertas: string;
        em_andamento: string;
        concluidas_30d: string;
        tempo_medio_horas: string | null;
      }[]
    >(
      `
      SELECT
        COUNT(*) FILTER (WHERE d.status = 'ABERTA')::int AS abertas,
        COUNT(*) FILTER (WHERE d.status = 'EM_ANDAMENTO')::int AS em_andamento,
        COUNT(*) FILTER (
          WHERE d.status = 'CONCLUIDA'
            AND d.concluida_em >= now() - INTERVAL '30 days'
        )::int AS concluidas_30d,
        ROUND(
          AVG(
            EXTRACT(EPOCH FROM (d.concluida_em - d.created_at)) / 3600.0
          ) FILTER (
            WHERE d.status = 'CONCLUIDA'
              AND d.concluida_em IS NOT NULL
              AND d.concluida_em >= now() - INTERVAL '90 days'
          )::numeric,
          1
        ) AS tempo_medio_horas
      FROM demandas d
      ${where}
      `,
      params,
    );
    const r = rows[0];
    return {
      abertas: Number(r?.abertas ?? 0),
      emAndamento: Number(r?.em_andamento ?? 0),
      concluidas30d: Number(r?.concluidas_30d ?? 0),
      tempoMedioConclusaoHoras: Number(r?.tempo_medio_horas ?? 0),
    };
  }

  async buscarNomeUsuario(userId: string): Promise<string | null> {
    const rows = await this.dataSource.query<{ nome: string | null }[]>(
      `SELECT nome FROM admin_users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return rows[0]?.nome ?? null;
  }

  private montarWhere(filtro: FiltroDemanda): { where: string; params: unknown[] } {
    const conds: string[] = [];
    const params: unknown[] = [];

    if (filtro.status !== undefined) {
      params.push(filtro.status);
      conds.push(`d.status = $${params.length}`);
    }
    if (filtro.tipo !== undefined) {
      params.push(filtro.tipo);
      conds.push(`d.tipo = $${params.length}`);
    }
    if (filtro.dataDe !== undefined) {
      params.push(filtro.dataDe);
      conds.push(`d.created_at >= $${params.length}`);
    }
    if (filtro.dataAte !== undefined) {
      params.push(filtro.dataAte);
      conds.push(`d.created_at <= $${params.length}`);
    }
    if (filtro.solicitanteUserId !== undefined) {
      params.push(filtro.solicitanteUserId);
      conds.push(`d.solicitante_user_id = $${params.length}`);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    return { where, params };
  }

  private linhaToItem(l: LinhaDemanda): DemandaItem {
    return {
      id: l.id,
      solicitanteNome: l.solicitante_nome,
      canal: l.canal,
      tipo: l.tipo,
      descricao: l.descricao,
      status: l.status,
      resposta: l.resposta,
      createdAt: l.created_at,
      atualizadaEm: l.updated_at,
      concluidaEm: l.concluida_em,
    };
  }

  private toOrm(d: Demanda): Partial<DemandaOrmEntity> {
    return {
      ...(d.id ? { id: d.id } : {}),
      solicitanteUserId: d.solicitanteUserId,
      solicitanteNome: d.solicitanteNome,
      canal: d.canal,
      tipo: d.tipo,
      descricao: d.descricao,
      status: d.status,
      resposta: d.resposta,
      concluidaEm: d.concluidaEm,
    };
  }

  private toDomain(o: DemandaOrmEntity): Demanda {
    return Demanda.create({
      id: o.id,
      solicitanteUserId: o.solicitanteUserId,
      solicitanteNome: o.solicitanteNome,
      canal: o.canal,
      tipo: o.tipo,
      descricao: o.descricao,
      status: o.status,
      resposta: o.resposta,
      concluidaEm: o.concluidaEm,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    });
  }
}
