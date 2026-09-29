import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  IMetricasAtendimentoRepository,
  InteracoesDaVendedora,
  JanelaDeMetrica,
  LeadsDaVendedora,
  MediaDeTempo,
} from '../../../../domain/ports/repositories/metricas-atendimento-repository.port';

/**
 * As metricas de atendimento, lidas do que ja esta gravado — 29/09/2026.
 *
 * ==========================================================================
 * SQL CRU, COMO O RESTO DAS CONSULTAS DE NUMERO DESTA CASA.
 *
 * Sao agregacoes com `FILTER`, `DISTINCT ON` e extracao de intervalo — coisas
 * que o QueryBuilder do TypeORM expressa mal e que ficariam ilegiveis. O
 * mesmo caminho ja foi escolhido para `vendas-movimentacao.repository.ts`.
 * ==========================================================================
 *
 * O RECORTE DE EQUIPE ENTRA PELO MESMO `= ANY($n::uuid[])` usado nas vendas:
 * `null` significa "a loja inteira" e um array vazio significa "a equipe dela
 * nao tem ninguem" — que sao respostas diferentes, e confundi-las mostraria a
 * loja para quem so pode ver o time.
 */
@Injectable()
export class MetricasAtendimentoRepository
  implements IMetricasAtendimentoRepository
{
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async leadsPorVendedora(j: JanelaDeMetrica): Promise<LeadsDaVendedora[]> {
    // O lead aponta para a vendedora por CODIGO, e nao por id — e o codigo do
    // ERP, que e o que a triagem sabia na epoca. O join traz o nome.
    const linhas: Array<{
      vendedora_id: string | null;
      codigo: string | null;
      nome: string;
      quantos: string;
    }> = await this.ds.query(
      `SELECT v.id            AS vendedora_id,
              l.codigo        AS codigo,
              COALESCE(v.nome, 'sem vendedora') AS nome,
              count(*)        AS quantos
         FROM (
                SELECT COALESCE(vendedora_aprovada_codigo,
                                vendedora_sugerida_codigo) AS codigo
                  FROM leads
                 WHERE criado_em >= $1 AND criado_em <= $2
              ) l
         LEFT JOIN vendedoras v ON v.codigo_erp = l.codigo
        WHERE ($3::uuid[] IS NULL OR v.id = ANY($3::uuid[]))
        GROUP BY 1, 2, 3
        ORDER BY count(*) DESC, 3`,
      [j.de, j.ate, j.vendedoraIds ?? null],
    );

    return linhas.map((l) => ({
      vendedoraId: l.vendedora_id,
      codigo: l.codigo,
      nome: l.nome,
      quantos: Number(l.quantos),
    }));
  }

  async interacoesPorVendedora(
    j: JanelaDeMetrica,
  ): Promise<InteracoesDaVendedora[]> {
    const linhas: Array<{
      vendedora_id: string;
      nome: string;
      total: string;
      da_vendedora: string;
      atendimentos: string;
    }> = await this.ds.query(
      `SELECT a.vendedora_id,
              v.nome,
              count(*)                                   AS total,
              count(*) FILTER (
                WHERE i.tipo IN ('RESPOSTA_VENDEDORA', 'RELATO')
              )                                          AS da_vendedora,
              count(DISTINCT a.id)                       AS atendimentos
         FROM atendimento_interacoes i
         JOIN atendimentos a  ON a.id = i.atendimento_id
         JOIN vendedoras   v  ON v.id = a.vendedora_id
        WHERE i.ocorrido_em >= $1 AND i.ocorrido_em <= $2
          AND ($3::uuid[] IS NULL OR a.vendedora_id = ANY($3::uuid[]))
        GROUP BY 1, 2
        ORDER BY count(*) DESC, 2`,
      [j.de, j.ate, j.vendedoraIds ?? null],
    );

    return linhas.map((l) => ({
      vendedoraId: l.vendedora_id,
      nome: l.nome,
      total: Number(l.total),
      daVendedora: Number(l.da_vendedora),
      atendimentos: Number(l.atendimentos),
    }));
  }

  async tempoPrimeiraResposta(j: JanelaDeMetrica): Promise<MediaDeTempo> {
    // `DISTINCT ON` pega, por atendimento, o PRIMEIRO contato da cliente; o
    // LATERAL busca a primeira resposta DEPOIS dele. Sem o "depois", uma
    // resposta antiga de outro ciclo entraria com tempo negativo.
    const [linha]: Array<{
      media: string | null;
      amostra: string;
      minimo: string | null;
      maximo: string | null;
    }> = await this.ds.query(
      `WITH primeiro_contato AS (
         SELECT DISTINCT ON (i.atendimento_id)
                i.atendimento_id, i.ocorrido_em, a.vendedora_id
           FROM atendimento_interacoes i
           JOIN atendimentos a ON a.id = i.atendimento_id
          WHERE i.tipo = 'CONTATO_CLIENTE'
            AND i.ocorrido_em >= $1 AND i.ocorrido_em <= $2
            AND ($3::uuid[] IS NULL OR a.vendedora_id = ANY($3::uuid[]))
          ORDER BY i.atendimento_id, i.ocorrido_em
       ),
       com_resposta AS (
         SELECT EXTRACT(EPOCH FROM (r.ocorrido_em - c.ocorrido_em)) / 60 AS minutos
           FROM primeiro_contato c
           JOIN LATERAL (
                  SELECT i.ocorrido_em
                    FROM atendimento_interacoes i
                   WHERE i.atendimento_id = c.atendimento_id
                     AND i.tipo = 'RESPOSTA_VENDEDORA'
                     AND i.ocorrido_em >= c.ocorrido_em
                   ORDER BY i.ocorrido_em
                   LIMIT 1
                ) r ON true
       )
       SELECT avg(minutos) AS media, count(*) AS amostra,
              min(minutos) AS minimo, max(minutos) AS maximo
         FROM com_resposta`,
      [j.de, j.ate, j.vendedoraIds ?? null],
    );

    return paraMedia(linha);
  }

  async tempoDeAtendimento(j: JanelaDeMetrica): Promise<MediaDeTempo> {
    return this.tempoDoEpisodio(j, null);
  }

  async tempoAteFecharVenda(j: JanelaDeMetrica): Promise<MediaDeTempo> {
    return this.tempoDoEpisodio(j, 'VENDA');
  }

  /**
   * A duracao do episodio, opcionalmente so os de um desfecho.
   *
   * A JANELA OLHA O FECHAMENTO, E NAO A ABERTURA. "Quanto durou um atendimento
   * em setembro" quer os que ACABARAM em setembro; filtrar pela abertura
   * deixaria de fora o que comecou em agosto e fechou agora, e incluiria o que
   * abriu ontem e ainda esta correndo — este ultimo sem duracao nenhuma.
   */
  private async tempoDoEpisodio(
    j: JanelaDeMetrica,
    desfecho: string | null,
  ): Promise<MediaDeTempo> {
    const [linha]: Array<{
      media: string | null;
      amostra: string;
      minimo: string | null;
      maximo: string | null;
    }> = await this.ds.query(
      `SELECT avg(minutos) AS media, count(*) AS amostra,
              min(minutos) AS minimo, max(minutos) AS maximo
         FROM (
           SELECT EXTRACT(EPOCH FROM (fechado_em - aberto_em)) / 60 AS minutos
             FROM atendimentos
            WHERE fechado_em IS NOT NULL
              AND fechado_em >= $1 AND fechado_em <= $2
              AND ($3::uuid[] IS NULL OR vendedora_id = ANY($3::uuid[]))
              AND ($4::text IS NULL OR desfecho::text = $4::text)
         ) d`,
      [j.de, j.ate, j.vendedoraIds ?? null, desfecho],
    );

    return paraMedia(linha);
  }
}

/**
 * O agregado do Postgres chega como string (ou `null`), e precisa virar
 * numero SEM que "nenhum caso" vire zero.
 *
 * ZERO E UMA AFIRMACAO: "responderam instantaneamente". `null` e outra: "nao
 * houve nenhum". Trocar as duas faria a tela mostrar um indicador excelente
 * justamente quando nao ha dado nenhum — o erro que a gente ja corrigiu na
 * tela de Produtos em 28/09.
 */
function paraMedia(linha: {
  media: string | null;
  amostra: string;
  minimo: string | null;
  maximo: string | null;
}): MediaDeTempo {
  const num = (v: string | null) => (v === null ? null : Math.round(Number(v)));
  return {
    minutos: num(linha?.media ?? null),
    amostra: Number(linha?.amostra ?? 0),
    minimo: num(linha?.minimo ?? null),
    maximo: num(linha?.maximo ?? null),
  };
}
