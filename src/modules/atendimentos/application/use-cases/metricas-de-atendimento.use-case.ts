import { Inject, Injectable } from '@nestjs/common';
import {
  METRICAS_ATENDIMENTO_REPOSITORY,
  type Conversao,
  type IMetricasAtendimentoRepository,
  type InteracoesDaVendedora,
  type JanelaDeMetrica,
  type LeadsDaVendedora,
  type MediaDeTempo,
} from '../../domain/ports/repositories/metricas-atendimento-repository.port';

export interface PainelDeMetricas {
  de: Date;
  ate: Date;
  leadsPorVendedora: LeadsDaVendedora[];
  interacoesPorVendedora: InteracoesDaVendedora[];
  primeiraResposta: MediaDeTempo;
  duracaoDoAtendimento: MediaDeTempo;
  ateFecharVenda: MediaDeTempo;
  conversao: Conversao;
}

/**
 * As metricas de atendimento que a gestao pede — ANA-08 a ANA-12.
 *
 * ==========================================================================
 * AS CINCO JUNTAS, NUMA RODADA SO.
 *
 * Elas sempre sao perguntadas juntas ("como foi o mes?") e saem das mesmas
 * duas tabelas. Buscar uma de cada vez faria a agente disparar cinco
 * ferramentas para montar uma frase — cinco idas ao banco e cinco turnos de
 * modelo para responder o que cabe em cinco linhas.
 *
 * `Promise.all` e nao sequencial: sao leituras independentes, e o tempo da
 * resposta no WhatsApp e o da mais lenta, nao a soma.
 * ==========================================================================
 */
@Injectable()
export class MetricasDeAtendimentoUseCase {
  constructor(
    @Inject(METRICAS_ATENDIMENTO_REPOSITORY)
    private readonly metricas: IMetricasAtendimentoRepository,
  ) {}

  async execute(janela: JanelaDeMetrica): Promise<PainelDeMetricas> {
    const [
      leadsPorVendedora,
      interacoesPorVendedora,
      primeiraResposta,
      duracaoDoAtendimento,
      ateFecharVenda,
      conversao,
    ] = await Promise.all([
      this.metricas.leadsPorVendedora(janela),
      this.metricas.interacoesPorVendedora(janela),
      this.metricas.tempoPrimeiraResposta(janela),
      this.metricas.tempoDeAtendimento(janela),
      this.metricas.tempoAteFecharVenda(janela),
      this.metricas.conversao(janela),
    ]);

    return {
      de: janela.de,
      ate: janela.ate,
      leadsPorVendedora,
      interacoesPorVendedora,
      primeiraResposta,
      duracaoDoAtendimento,
      ateFecharVenda,
      conversao,
    };
  }
}

/**
 * Minutos em portugues de gente.
 *
 * ==========================================================================
 * "1.437 MINUTOS" NAO E RESPOSTA, E CONTA DE CABECA PARA QUEM LE.
 *
 * Quem pergunta no WhatsApp quer "quase um dia", e nao um numero para
 * dividir por 60 e depois por 24. A precisao perdida no arredondamento nao
 * muda decisao nenhuma; a leitura em voz alta muda.
 * ==========================================================================
 */
export function emPortugues(minutos: number | null): string {
  if (minutos === null) return 'sem dado';
  if (minutos < 1) return 'menos de um minuto';
  if (minutos < 60) return `${Math.round(minutos)} min`;

  const horas = minutos / 60;
  if (horas < 24) {
    const h = Math.floor(horas);
    const m = Math.round(minutos - h * 60);
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  const dias = horas / 24;
  // Um decimal ate dez dias; depois dele a fracao nao diz mais nada.
  const arredondado = dias < 10 ? Math.round(dias * 10) / 10 : Math.round(dias);
  return `${String(arredondado).replace('.', ',')} ${arredondado === 1 ? 'dia' : 'dias'}`;
}

/**
 * A media com o tamanho da amostra colado.
 *
 * A AMOSTRA VAI JUNTO SEMPRE, e nao so quando e pequena. Em 29/09/2026 a base
 * tinha um lead e um celular conectado: toda media desta safra sai de dois ou
 * tres casos. Esconder isso entregaria a anedota com cara de indicador — e a
 * gestao tomaria decisao de operacao em cima de uma amostra de um.
 */
export function comAmostra(m: MediaDeTempo, rotulo: string): string {
  if (m.amostra === 0) return `${rotulo}: ainda sem nenhum caso no período.`;

  const caso = m.amostra === 1 ? 'caso' : 'casos';
  const faixa =
    m.amostra > 1 && m.minimo !== null && m.maximo !== null
      ? ` (do mais rápido ${emPortugues(m.minimo)} ao mais lento ${emPortugues(m.maximo)})`
      : '';

  return `${rotulo}: ${emPortugues(m.minutos)}, sobre ${m.amostra} ${caso}${faixa}.`;
}

/**
 * A conversao em uma frase — ANA-13.
 *
 * ==========================================================================
 * A PORCENTAGEM NUNCA SAI SOZINHA.
 *
 * "40%" esconde se foram 2 de 5 ou 200 de 500, e esconde quantos ainda estao
 * em aberto — que sao os que podem mudar o numero amanha. A frase leva os
 * tres, sempre: o denominador impede que uma amostra minuscula passe por
 * indicador, e o "em aberto" impede que a taxa seja lida como definitiva.
 * ==========================================================================
 */
export function fraseDaConversao(c: Conversao): string {
  const decididos = c.ganhos + c.perdidos;

  if (decididos === 0) {
    return c.emAberto > 0
      ? `Conversão: nenhum lead teve desfecho ainda — ${c.emAberto} em aberto.`
      : 'Conversão: nenhum lead no período.';
  }

  const aberto =
    c.emAberto > 0
      ? `, e ${c.emAberto} ainda em aberto`
      : '';

  return (
    `Conversão: ${c.taxa}% — ${c.ganhos} de ${decididos} lead(s) com desfecho ` +
    `(${c.perdidos} perdido(s))${aberto}.`
  );
}
