import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  DisparoDeAlerta,
  IAlertaRepository,
  LeadEmAtraso,
  RegraDeAlerta,
  TipoDeAlvo,
} from '../../domain/ports/alerta-repository.port';

@Injectable()
export class AlertaRepository implements IAlertaRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async listarRegras(): Promise<RegraDeAlerta[]> {
    const linhas: Array<{
      chave: string;
      descricao: string;
      ativo: boolean;
      prazo_minutos: number;
      repetir_apos_minutos: number | null;
    }> = await this.ds.query(
      `SELECT chave, descricao, ativo, prazo_minutos, repetir_apos_minutos
         FROM alerta_regras ORDER BY chave`,
    );
    return linhas.map(paraRegra);
  }

  async atualizarRegra(
    chave: string,
    mudanca: Partial<
      Pick<RegraDeAlerta, 'ativo' | 'prazoMinutos' | 'repetirAposMinutos'>
    >,
  ): Promise<RegraDeAlerta | null> {
    // COALESCE em vez de montar o SET dinamicamente: o `undefined` de quem nao
    // quis mexer vira NULL no parametro, e o COALESCE devolve o valor atual.
    // Montar SQL por concatenacao aqui seria a porta de entrada obvia.
    const linhas = await this.ds.query(
      `UPDATE alerta_regras
          SET ativo                = COALESCE($2, ativo),
              prazo_minutos        = COALESCE($3, prazo_minutos),
              -- repetirApos NULO E UM VALOR, e nao "nao mexa": e assim que
              -- se diz "avise uma vez so". Por isso ele tem bandeira propria
              -- em vez de depender do COALESCE, que nao distingue os dois.
              repetir_apos_minutos = CASE WHEN $4 THEN $5 ELSE repetir_apos_minutos END,
              atualizado_em        = now()
        WHERE chave = $1
    RETURNING chave, descricao, ativo, prazo_minutos, repetir_apos_minutos`,
      [
        chave,
        mudanca.ativo ?? null,
        mudanca.prazoMinutos ?? null,
        Object.prototype.hasOwnProperty.call(mudanca, 'repetirAposMinutos'),
        mudanca.repetirAposMinutos ?? null,
      ],
    );
    return linhas.length ? paraRegra(linhas[0]) : null;
  }

  /**
   * ANA-04 — quem chegou e ninguem respondeu.
   *
   * O `estado = 'NOVO'` E A DEFINICAO INTEIRA. Desde o funil de 29/09, `NOVO`
   * significa exatamente "ninguem respondeu ainda"; quem responde tira o lead
   * de la. Recalcular isso aqui a partir das mensagens criaria uma segunda
   * definicao de "sem resposta", e as duas divergiriam no primeiro caso de
   * borda — com o alerta cobrando atendimento que ja aconteceu.
   */
  async leadsSemResposta(limite: Date): Promise<LeadEmAtraso[]> {
    return this.leadsPorEstado('NOVO', limite);
  }

  /** ANA-19 — o que a varredura de 7 dias ja marcou como parado. */
  async leadsParados(limite: Date): Promise<LeadEmAtraso[]> {
    return this.leadsPorEstado('PARADO', limite);
  }

  private async leadsPorEstado(
    estado: string,
    limite: Date,
  ): Promise<LeadEmAtraso[]> {
    const linhas: Array<{
      lead_id: string;
      nome: string | null;
      vendedora_codigo: string | null;
      vendedora_nome: string | null;
      desde: Date;
      minutos: string;
    }> = await this.ds.query(
      `SELECT l.id AS lead_id,
              l.nome,
              COALESCE(l.vendedora_aprovada_codigo,
                       l.vendedora_sugerida_codigo) AS vendedora_codigo,
              v.nome                                AS vendedora_nome,
              l.estado_atualizado_em                AS desde,
              EXTRACT(EPOCH FROM (now() - l.estado_atualizado_em)) / 60 AS minutos
         FROM leads l
         LEFT JOIN vendedoras v
           ON v.codigo_erp = COALESCE(l.vendedora_aprovada_codigo,
                                      l.vendedora_sugerida_codigo)
        WHERE l.estado = $1::estado_lead
          AND l.estado_atualizado_em <= $2
        ORDER BY l.estado_atualizado_em`,
      [estado, limite],
    );

    return linhas.map((l) => ({
      leadId: l.lead_id,
      nome: l.nome,
      vendedoraCodigo: l.vendedora_codigo,
      vendedoraNome: l.vendedora_nome,
      desde: new Date(l.desde),
      minutosParado: Math.round(Number(l.minutos)),
    }));
  }

  /**
   * ANA-21 — a pergunta que impede o repetidor.
   *
   * `janelaMinutos` nulo significa "alguma vez ja": e o alerta que avisa uma
   * unica vez. Tratar nulo como "janela zero" faria esse alerta repetir a
   * cada rodada — exatamente o defeito que esta tabela existe para evitar.
   */
  async jaAvisou(
    regra: string,
    alvoTipo: TipoDeAlvo,
    alvoId: string,
    janelaMinutos: number | null,
  ): Promise<boolean> {
    const linhas = await this.ds.query(
      `SELECT 1
         FROM alerta_disparos
        WHERE regra = $1 AND alvo_tipo = $2 AND alvo_id = $3
          AND ($4::int IS NULL
               OR enviado_em > now() - make_interval(mins => $4::int))
        LIMIT 1`,
      [regra, alvoTipo, alvoId, janelaMinutos],
    );
    return linhas.length > 0;
  }

  async registrarDisparo(d: DisparoDeAlerta): Promise<void> {
    await this.ds.query(
      `INSERT INTO alerta_disparos (regra, alvo_tipo, alvo_id, destinatario)
       VALUES ($1, $2, $3, $4)`,
      [d.regra, d.alvoTipo, d.alvoId, d.destinatario],
    );
  }
}

function paraRegra(l: {
  chave: string;
  descricao: string;
  ativo: boolean;
  prazo_minutos: number;
  repetir_apos_minutos: number | null;
}): RegraDeAlerta {
  return {
    chave: l.chave,
    descricao: l.descricao,
    ativo: l.ativo,
    prazoMinutos: Number(l.prazo_minutos),
    repetirAposMinutos:
      l.repetir_apos_minutos === null ? null : Number(l.repetir_apos_minutos),
  };
}
