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
  /** O dia mostrado, em ISO. E sempre o pedido — ou hoje. */
  dia: string;
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
   * @param dia `YYYY-MM-DD`. Sem ele, HOJE — sempre.
   *
   * ========================================================================
   * ABRE NO DIA DE HOJE, MESMO VAZIO.
   *
   * Ate 09/09/2026 esta tela recuava sozinha para o ultimo dia com movimento
   * quando hoje estava parado. A intencao era boa — regua vazia parece
   * defeito. O efeito na pratica foi pior: a tela abria no dia 26 e quem
   * olhava de relance lia aquilo como HOJE, porque e nisso que se acredita ao
   * abrir uma tela chamada "Linha do tempo · hoje".
   *
   * Dia parado e uma informacao, e das fortes. Mostrar outro dia no lugar dela
   * troca um vazio honesto por um numero errado. Quem quiser ver o dia 26
   * escolhe o dia 26 — a navegacao por data continua ali.
   * ========================================================================
   */
  async execute(dia?: string): Promise<LinhaDoTempo> {
    const alvo = dia ? diaDe(dia) : hoje();
    const pontos = await this.repo.linhaDoTempo(alvo, somaUmDia(alvo));

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

    return { dia: emIso(alvo), faixas };
  }

  /**
   * Os pontos de UMA vendedora num dia.
   *
   * Quem pergunta e a gestao, com uma pergunta datada: "como foi o dia da
   * Marina hoje". Dia vazio devolve lista vazia, e quem chama diz "nada
   * hoje" — responder com anteontem sem ela pedir seria a pior resposta
   * possivel, porque parece certa e esta errada.
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
