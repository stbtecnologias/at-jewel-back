import { Inject, Injectable } from '@nestjs/common';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IAtendimentoRepository,
  PontoDaLinha,
} from '../../domain/ports/repositories/atendimento-repository.port';

/** Uma faixa da tela: a vendedora e o que ela fez naquele dia. */
export interface FaixaDaLinha {
  vendedoraId: string;
  vendedoraNome: string;
  pontos: PontoDaLinha[];
}

export interface LinhaDoTempo {
  /** O dia efetivamente mostrado, em ISO. Pode nao ser o pedido — ver abaixo. */
  dia: string;
  /** true quando o dia veio do "ultimo dia com movimento", e nao do pedido. */
  recuado: boolean;
  faixas: FaixaDaLinha[];
}

/**
 * A Linha do Tempo do dia, uma faixa por vendedora — MEL-14.
 *
 * ==========================================================================
 * TODA VENDEDORA ATIVA APARECE, TENHA FEITO ALGO OU NAO.
 *
 * Seria mais limpo listar so quem teve movimento. Seria tambem esconder
 * justamente o que a gestao mais precisa ver: a faixa VAZIA. Uma vendedora
 * sem nenhum ponto o dia inteiro e uma informacao, e das fortes — some-la da
 * tela transformaria ausencia em silencio.
 *
 * A ordem e ALFABETICA, para a faixa de cada uma ficar sempre no mesmo
 * lugar — ver o comentario junto do `sort`.
 * ==========================================================================
 */
@Injectable()
export class ConsultarLinhaDoTempoUseCase {
  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly repo: IAtendimentoRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
  ) {}

  /**
   * @param dia `YYYY-MM-DD`. Sem ele, hoje.
   *
   * ========================================================================
   * SEM DIA PEDIDO E DIA VAZIO, RECUA PARA O ULTIMO COM MOVIMENTO.
   *
   * A tela aberta numa segunda de manha mostraria uma regua vazia, e regua
   * vazia parece defeito — a pessoa conclui que a Linha do Tempo nao funciona
   * e nunca mais volta. Recuando, ela ve dados de verdade na primeira vez, e
   * o cabecalho diz em letras claras QUE DIA e aquele.
   *
   * So vale quando o dia NAO foi pedido. Se alguem escolheu 07/09 a dedo,
   * 07/09 vazio e a resposta certa — trocar o dia por baixo seria mentir
   * sobre o que ele esta olhando.
   * ========================================================================
   */
  async execute(dia?: string): Promise<LinhaDoTempo> {
    const pedido = dia ? diaDe(dia) : hoje();
    let alvo = pedido;
    let recuado = false;

    let pontos = await this.repo.linhaDoTempo(alvo, somaUmDia(alvo));

    if (!dia && pontos.length === 0) {
      const ultimo = await this.repo.ultimoDiaComMovimento();
      if (ultimo && ultimo.getTime() !== alvo.getTime()) {
        alvo = ultimo;
        recuado = true;
        pontos = await this.repo.linhaDoTempo(alvo, somaUmDia(alvo));
      }
    }

    const ativas = await this.vendedoras.listar({ ativo: true });

    const porVendedora = new Map<string, PontoDaLinha[]>();
    for (const p of pontos) {
      const lista = porVendedora.get(p.vendedoraId);
      if (lista) lista.push(p);
      else porVendedora.set(p.vendedoraId, [p]);
    }

    const faixas: FaixaDaLinha[] = ativas
      .filter((v): v is typeof v & { id: string } => Boolean(v.id))
      .map((v) => ({
        vendedoraId: v.id,
        vendedoraNome: v.nome,
        pontos: porVendedora.get(v.id) ?? [],
      }));

    // Quem teve movimento e nao esta mais ativa ainda assim aparece: o dia
    // dela aconteceu, e apagar isso reescreveria o passado.
    const jaListadas = new Set(faixas.map((f) => f.vendedoraId));
    for (const [id, lista] of porVendedora) {
      if (jaListadas.has(id)) continue;
      faixas.push({
        vendedoraId: id,
        vendedoraNome: lista[0].vendedoraNome,
        pontos: lista,
      });
    }

    // ======================================================================
    // ALFABETICA, E NAO POR QUANTIDADE DE PONTOS.
    //
    // Ordenar por atividade parecia melhor — quem mais se mexeu no topo. Na
    // pratica as faixas DANCAM todo dia: a mesma pessoa muda de linha
    // conforme o movimento, e ninguem consegue dizer "a Marina e a terceira".
    // Numa tela que se olha de relance, posicao estavel vale mais que ranking.
    //
    // E nao se perde nada: quem nao fez nada continua visivel, com a faixa
    // vazia e o rotulo "sem registro" — sinal mais forte que estar no fim.
    //
    // Alinha tambem com a aba Conexoes, que ja lista por nome porque e a
    // ordem que o repositorio de vendedoras devolve.
    // ======================================================================
    faixas.sort((a, b) => a.vendedoraNome.localeCompare(b.vendedoraNome, 'pt-BR'));

    return { dia: emIso(alvo), recuado, faixas };
  }

  /**
   * Os pontos de UMA vendedora num dia — sem recuo.
   *
   * ========================================================================
   * SEM RECUO DE PROPOSITO, AO CONTRARIO DO `execute`.
   *
   * La o recuo existe porque a TELA aberta num dia parado pareceria quebrada.
   * Aqui quem pergunta e a gestao, com uma pergunta datada: "como foi o dia da
   * Marina hoje". Responder com anteontem sem ela pedir seria a pior resposta
   * possivel — parece certa, e esta errada.
   *
   * Dia vazio devolve lista vazia, e quem chama diz "nada hoje".
   * ========================================================================
   */
  async doDia(vendedoraId: string, dia?: string): Promise<PontoDaLinha[]> {
    const alvo = dia ? diaDe(dia) : hoje();
    const pontos = await this.repo.linhaDoTempo(alvo, somaUmDia(alvo));
    return pontos.filter((p) => p.vendedoraId === vendedoraId);
  }
}

/** Meia-noite de hoje, no fuso do servidor (America/Sao_Paulo). */
function hoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * `2026-09-08` -> meia-noite LOCAL desse dia.
 *
 * `new Date('2026-09-08')` daria meia-noite em UTC, que aqui e 21h do dia 7 —
 * a tela mostraria o dia anterior a partir das 21h. Por isso os pedacos sao
 * montados a mao.
 */
function diaDe(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 0, 0, 0, 0);
}

function somaUmDia(d: Date): Date {
  const fim = new Date(d);
  fim.setDate(fim.getDate() + 1);
  return fim;
}

function emIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
