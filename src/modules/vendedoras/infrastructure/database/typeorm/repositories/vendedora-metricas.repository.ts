import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VendedoraMetricas } from '../../../../domain/entities/vendedora-metricas.entity';
import { IVendedoraMetricasRepository } from '../../../../domain/ports/repositories/vendedora-metricas-repository.port';

// Shape cru retornado pela matview. Postgres devolve DECIMAL/NUMERIC e
// SUM/AVG como string; BIGINT (COUNT) tambem vem string. Convertidos abaixo.
interface VendedoraMetricasRow {
  vendedora_id: string;
  total_vendas: string;
  receita_total: string | null;
  ticket_medio: string | null;
  clientes_distintos: string;
  clientes_recorrentes: string;
  taxa_recompra: string | null;
  tempo_medio_fechamento_horas: string | null;
  primeira_venda_em: Date | null;
  ultima_venda_em: Date | null;
  atualizado_em: Date;
}

// Colunas selecionadas explicitamente (evita SELECT * e fixa a ordem do
// mapeamento). A matview vem da migracao 10; este repo so a le.
const SELECT_COLUNAS = `
  vendedora_id,
  total_vendas,
  receita_total,
  ticket_medio,
  clientes_distintos,
  clientes_recorrentes,
  taxa_recompra,
  tempo_medio_fechamento_horas,
  primeira_venda_em,
  ultima_venda_em,
  atualizado_em
`;

@Injectable()
export class VendedoraMetricasRepository implements IVendedoraMetricasRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listar(): Promise<VendedoraMetricas[]> {
    const rows = await this.dataSource.query<VendedoraMetricasRow[]>(
      `SELECT ${SELECT_COLUNAS}
       FROM vendedoras_metricas
       ORDER BY receita_total DESC NULLS LAST`,
    );
    return rows.map((r) => this.toDomain(r));
  }

  async buscarPorVendedoraId(
    vendedoraId: string,
  ): Promise<VendedoraMetricas | null> {
    // Parametrizado ($1) — sem interpolacao de input.
    const rows = await this.dataSource.query<VendedoraMetricasRow[]>(
      `SELECT ${SELECT_COLUNAS}
       FROM vendedoras_metricas
       WHERE vendedora_id = $1
       LIMIT 1`,
      [vendedoraId],
    );
    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async refresh(): Promise<void> {
    // CONCURRENTLY exige o UNIQUE INDEX criado na migracao 10. Nome da
    // matview e literal fixo (sem input do usuario) — sem risco de injecao.
    // O primeiro refresh funciona porque o CREATE da migracao popula a view.
    await this.dataSource.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY vendedoras_metricas',
    );
  }

  // Postgres retorna agregados numericos como string. Converte preservando
  // null (campos que podem vir nulos quando nao ha base para o calculo).
  private numeroOuNull(valor: string | null): number | null {
    return valor != null ? Number(valor) : null;
  }

  private toDomain(r: VendedoraMetricasRow): VendedoraMetricas {
    return VendedoraMetricas.create({
      vendedoraId: r.vendedora_id,
      totalVendas: Number(r.total_vendas),
      receitaTotal: Number(r.receita_total ?? 0),
      ticketMedio: Number(r.ticket_medio ?? 0),
      clientesDistintos: Number(r.clientes_distintos),
      clientesRecorrentes: Number(r.clientes_recorrentes),
      taxaRecompra: Number(r.taxa_recompra ?? 0),
      tempoMedioFechamentoHoras: this.numeroOuNull(
        r.tempo_medio_fechamento_horas,
      ),
      primeiraVendaEm: r.primeira_venda_em,
      ultimaVendaEm: r.ultima_venda_em,
      atualizadoEm: r.atualizado_em,
    });
  }
}
