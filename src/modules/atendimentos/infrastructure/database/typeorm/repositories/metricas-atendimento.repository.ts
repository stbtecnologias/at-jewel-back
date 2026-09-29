import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  Conversao,
  DesfechoDaVendedora,
  ParDeResposta,
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

  /**
   * ANA-13 — a conversao, contada sobre quem JA TEVE DESFECHO.
   *
   * O recorte de equipe passa pelo CODIGO da vendedora, e nao pelo id: o lead
   * guarda `vendedora_aprovada_codigo` (codigo do ERP), herdado da epoca da
   * triagem. O subselect traduz os ids da equipe em codigos.
   */
  async conversao(j: JanelaDeMetrica): Promise<Conversao> {
    const [linha]: Array<{
      ganhos: string;
      perdidos: string;
      em_aberto: string;
    }> = await this.ds.query(
      `SELECT count(*) FILTER (WHERE estado = 'GANHO')   AS ganhos,
              count(*) FILTER (WHERE estado = 'PERDIDO') AS perdidos,
              count(*) FILTER (
                WHERE estado IN ('NOVO', 'EM_ATENDIMENTO', 'PARADO')
              )                                          AS em_aberto
         FROM leads
        WHERE criado_em >= $1 AND criado_em <= $2
          AND (
            $3::uuid[] IS NULL
            OR COALESCE(vendedora_aprovada_codigo, vendedora_sugerida_codigo) IN (
                 SELECT codigo_erp FROM vendedoras WHERE id = ANY($3::uuid[])
               )
          )`,
      [j.de, j.ate, j.vendedoraIds ?? null],
    );

    const ganhos = Number(linha?.ganhos ?? 0);
    const perdidos = Number(linha?.perdidos ?? 0);
    const comDesfecho = ganhos + perdidos;

    return {
      ganhos,
      perdidos,
      emAberto: Number(linha?.em_aberto ?? 0),
      // NADA FECHADO NAO E ZERO POR CENTO. Zero afirma que ninguem comprou;
      // aqui ninguem terminou de decidir ainda.
      taxa: comDesfecho === 0 ? null : Math.round((ganhos / comDesfecho) * 100),
    };
  }

  /**
   * ANA-14 — os pares crus, para o relogio comercial ser aplicado fora daqui.
   *
   * Mesma estrutura do `tempoPrimeiraResposta`: `DISTINCT ON` pega o primeiro
   * contato de cada atendimento e o LATERAL busca a primeira resposta DEPOIS
   * dele. Aqui os instantes voltam inteiros em vez de virar media, porque o
   * desconto do horario comercial precisa de cada par separado.
   */
  async paresDeResposta(j: JanelaDeMetrica): Promise<ParDeResposta[]> {
    const linhas: Array<{
      vendedora_id: string;
      nome: string;
      contato_em: Date;
      resposta_em: Date;
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
       )
       SELECT c.vendedora_id,
              v.nome,
              c.ocorrido_em AS contato_em,
              r.ocorrido_em AS resposta_em
         FROM primeiro_contato c
         JOIN vendedoras v ON v.id = c.vendedora_id
         JOIN LATERAL (
                SELECT i.ocorrido_em
                  FROM atendimento_interacoes i
                 WHERE i.atendimento_id = c.atendimento_id
                   AND i.tipo = 'RESPOSTA_VENDEDORA'
                   AND i.ocorrido_em >= c.ocorrido_em
                 ORDER BY i.ocorrido_em
                 LIMIT 1
              ) r ON true`,
      [j.de, j.ate, j.vendedoraIds ?? null],
    );

    return linhas.map((l) => ({
      vendedoraId: l.vendedora_id,
      nome: l.nome,
      contatoEm: new Date(l.contato_em),
      respostaEm: new Date(l.resposta_em),
    }));
  }

  async desfechoPorVendedora(
    j: JanelaDeMetrica,
  ): Promise<DesfechoDaVendedora[]> {
    // O lead aponta para a vendedora por CODIGO do ERP, herdado da triagem.
    const linhas: Array<{
      codigo: string;
      nome: string;
      ganhos: string;
      perdidos: string;
    }> = await this.ds.query(
      `SELECT l.codigo,
              v.nome,
              count(*) FILTER (WHERE l.estado = 'GANHO')   AS ganhos,
              count(*) FILTER (WHERE l.estado = 'PERDIDO') AS perdidos
         FROM (
                SELECT COALESCE(vendedora_aprovada_codigo,
                                vendedora_sugerida_codigo) AS codigo,
                       estado
                  FROM leads
                 WHERE criado_em >= $1 AND criado_em <= $2
              ) l
         JOIN vendedoras v ON v.codigo_erp = l.codigo
        WHERE ($3::uuid[] IS NULL OR v.id = ANY($3::uuid[]))
        GROUP BY 1, 2
       HAVING count(*) FILTER (WHERE l.estado IN ('GANHO', 'PERDIDO')) > 0`,
      [j.de, j.ate, j.vendedoraIds ?? null],
    );

    return linhas.map((l) => ({
      codigo: l.codigo,
      nome: l.nome,
      ganhos: Number(l.ganhos),
      perdidos: Number(l.perdidos),
    }));
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
