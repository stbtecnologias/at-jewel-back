import { Inject, Injectable } from '@nestjs/common';
import {
  minutosCorridos,
  minutosDeExpediente,
} from '../../../../shared/tempo/horario-comercial';
import {
  METRICAS_ATENDIMENTO_REPOSITORY,
  type IMetricasAtendimentoRepository,
  type JanelaDeMetrica,
} from '../../domain/ports/repositories/metricas-atendimento-repository.port';

/**
 * QUANTOS CASOS UMA VENDEDORA PRECISA TER PARA ENTRAR NUM RANKING.
 *
 * ==========================================================================
 * SEM PISO, O RANKING PREMIA QUEM TRABALHOU MENOS.
 *
 * Uma vendedora com UM atendimento respondido em 2 minutos vence quem
 * atendeu quarenta com media de 8. O numero e verdadeiro e a conclusao e
 * falsa — e e a conclusao que vira conversa de feedback.
 *
 * Dois nao resolve o problema estatistico; resolve o caso absurdo, que e o
 * que aparece primeiro numa base pequena. Quando houver volume, este numero
 * sobe — e por isso ele tem nome, e nao esta escrito no meio do codigo.
 * ==========================================================================
 */
export const MINIMO_PARA_RANQUEAR = 2;

export interface PostoDeRanking {
  nome: string;
  /** O valor que ordena — minutos, contagem ou percentual, conforme o eixo. */
  valor: number;
  /** Quantos casos sustentam o valor. Vai SEMPRE para a frase. */
  amostra: number;
  /** Só nos eixos de tempo: o mesmo valor sem descontar o horário da loja. */
  corrido?: number;
}

export interface RankingsDeAtendimento {
  de: Date;
  ate: Date;
  /** ANA-14 (1) — menor tempo até a primeira resposta. */
  respondeMaisRapido: PostoDeRanking[];
  /** ANA-14 (2) — menor tempo entre abrir e fechar em VENDA. */
  fechaMaisRapido: PostoDeRanking[];
  /** ANA-14 (3) — mais pontos de contato registrados. */
  maisInterage: PostoDeRanking[];
  /** ANA-14 (4) — maior percentual de leads ganhos entre os decididos. */
  maisConverte: PostoDeRanking[];
  /** ANA-14 (5) — mais leads recebidos. */
  maisLeads: PostoDeRanking[];
  /** Quem ficou de fora dos rankings de média por ter poucos casos. */
  semAmostra: string[];
}

/**
 * Os cinco rankings do ANA-14.
 *
 * ==========================================================================
 * O TEMPO DE RESPOSTA E CONTADO NO RELOGIO DA LOJA, E ISSO MUDA O PODIO.
 *
 * Cliente escreve 23h40, vendedora responde 8h10: em tempo corrido sao 8h30 e
 * ela e a pior da equipe; no relogio da loja sao 10 minutos e ela e a melhor.
 * Como o telefone corporativo recebe cliente a qualquer hora, inclusive
 * sabado e domingo (Lucas, 29/09/2026), o tempo corrido ranquearia por QUANDO
 * a cliente escreveu, e nao por como a vendedora atendeu.
 *
 * O corrido vai junto mesmo assim, como o documento pediu: e ele que mostra
 * quem responde fora do expediente — esforco que o relogio da loja apaga.
 * ==========================================================================
 */
@Injectable()
export class RankingsDeAtendimentoUseCase {
  constructor(
    @Inject(METRICAS_ATENDIMENTO_REPOSITORY)
    private readonly metricas: IMetricasAtendimentoRepository,
  ) {}

  async execute(janela: JanelaDeMetrica): Promise<RankingsDeAtendimento> {
    const [pares, desfechos, interacoes, leads, tempoVenda] = await Promise.all([
      this.metricas.paresDeResposta(janela),
      this.metricas.desfechoPorVendedora(janela),
      this.metricas.interacoesPorVendedora(janela),
      this.metricas.leadsPorVendedora(janela),
      this.metricas.tempoAteFecharVenda(janela),
    ]);

    const semAmostra = new Set<string>();

    // ---- (1) quem responde mais rápido -------------------------------------
    const porVendedora = new Map<
      string,
      { nome: string; loja: number[]; corrido: number[] }
    >();
    for (const p of pares) {
      const atual = porVendedora.get(p.vendedoraId) ?? {
        nome: p.nome,
        loja: [],
        corrido: [],
      };
      atual.loja.push(minutosDeExpediente(p.contatoEm, p.respostaEm));
      atual.corrido.push(minutosCorridos(p.contatoEm, p.respostaEm));
      porVendedora.set(p.vendedoraId, atual);
    }

    const respondeMaisRapido: PostoDeRanking[] = [];
    for (const v of porVendedora.values()) {
      if (v.loja.length < MINIMO_PARA_RANQUEAR) {
        semAmostra.add(v.nome);
        continue;
      }
      respondeMaisRapido.push({
        nome: v.nome,
        valor: media(v.loja),
        corrido: media(v.corrido),
        amostra: v.loja.length,
      });
    }
    respondeMaisRapido.sort((a, b) => a.valor - b.valor);

    // ---- (2) quem fecha venda em menos tempo -------------------------------
    // ==================================================================
    // AQUI O RANKING NAO EXISTE AINDA, E DIZER ISSO E MAIS HONESTO QUE
    // INVENTAR UMA LINHA.
    //
    // `tempoAteFecharVenda` devolve a media DA LOJA, nao por vendedora — o
    // atendimento so ganha dono quando ha cliente cadastrado, e hoje nao ha
    // nenhum atendimento fechado na base. Em vez de montar um ranking de uma
    // linha so, o eixo volta vazio e a frase diz por que.
    // ==================================================================
    const fechaMaisRapido: PostoDeRanking[] =
      tempoVenda.amostra >= MINIMO_PARA_RANQUEAR && tempoVenda.minutos !== null
        ? [{ nome: 'a loja', valor: tempoVenda.minutos, amostra: tempoVenda.amostra }]
        : [];

    // ---- (3) quem mais interage --------------------------------------------
    const maisInterage: PostoDeRanking[] = interacoes
      .map((i) => ({ nome: i.nome, valor: i.total, amostra: i.atendimentos }))
      .sort((a, b) => b.valor - a.valor);

    // ---- (4) quem mais converte --------------------------------------------
    const maisConverte: PostoDeRanking[] = [];
    for (const d of desfechos) {
      const decididos = d.ganhos + d.perdidos;
      if (decididos < MINIMO_PARA_RANQUEAR) {
        semAmostra.add(d.nome);
        continue;
      }
      maisConverte.push({
        nome: d.nome,
        valor: Math.round((d.ganhos / decididos) * 100),
        amostra: decididos,
      });
    }
    maisConverte.sort((a, b) => b.valor - a.valor);

    // ---- (5) quem recebe mais leads ----------------------------------------
    const maisLeads: PostoDeRanking[] = leads
      // "sem vendedora" e um agregado, e nao uma pessoa: nao disputa ranking.
      .filter((l) => l.vendedoraId !== null)
      .map((l) => ({ nome: l.nome, valor: l.quantos, amostra: l.quantos }))
      .sort((a, b) => b.valor - a.valor);

    return {
      de: janela.de,
      ate: janela.ate,
      respondeMaisRapido,
      fechaMaisRapido,
      maisInterage,
      maisConverte,
      maisLeads,
      semAmostra: [...semAmostra].sort(),
    };
  }
}

function media(valores: number[]): number {
  return Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);
}
