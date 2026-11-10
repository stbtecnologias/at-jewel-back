import { Injectable, Logger } from '@nestjs/common';
import { ConexoesService } from '../../atendimento/application/conexoes.service';
import { FUSO_DA_LOJA } from '../../../shared/erp/data-do-erp';
import {
  TelegramClient,
  type LinhaDoBloco,
  type NivelDoAviso,
} from '../infrastructure/telegram/telegram.client';

/**
 * ==========================================================================
 * A REGRA DO AVISO DE CONEXAO — 10/11/2026.
 *
 * O caso que originou: os chips da loja nao tem aparelho e deslogam a cada
 * quatorze dias. Na ultima vez ficou TRES DIAS caido, porque a agente fica
 * quieta e ninguem de fora percebe que ela parou.
 *
 * A regra do Lucas e de uma linha: mudou, avisa. Nao ha lista de quem
 * importa — a conexao parada ha treze dias fica quieta por estar PARADA, e
 * nao por estar fora de uma lista. E quem causou a mudanca nao entra na
 * conta: clicar Conectar no painel avisa igual, e deslogar pelo celular nem
 * daria para distinguir.
 *
 * NAO HA MEMORIA DE ESTADO AQUI, e e decisao dele: "o estado que esta agora
 * fica sem nada alertado". O ouvinte sobe e espera. Os dois mapas abaixo nao
 * detectam mudanca — quem detecta e o WAHA, que so manda evento quando algo
 * muda. Um e trava anti-enxurrada; o outro so guarda a hora da queda para a
 * mensagem de volta poder dizer quanto tempo ficou fora. Perder os dois num
 * reinicio nao estraga nada: a linha some, e so.
 * ==========================================================================
 */

export interface EventoDeStatus {
  sessao: string;
  status: string;
  /** So chega preenchido em WORKING. */
  numero: string | null;
  em: Date;
}

interface Fala {
  nivel: NivelDoAviso;
  /** Vai depois do nome: "Anastasia <sufixo>". */
  sufixo: string;
  /** Hashtag, sem `#`. */
  etiqueta: string;
  /** Como a hora aparece no bloco. */
  quando: string;
  silencioso?: boolean;
  recado?: string;
}

/**
 * `STARTING` NAO APARECE AQUI, e e de proposito.
 *
 * Na medicao de 10/11 ele chegou UM SEGUNDO antes do `SCAN_QR_CODE`: avisar
 * os dois seria mensagem dobrada para um acontecimento so.
 */
const FALA: Record<string, Fala> = {
  WORKING: {
    nivel: 'bom',
    sufixo: 'reconectada',
    etiqueta: 'ok',
    quando: 'Desde',
    // Noticia boa nao precisa tocar.
    silencioso: true,
  },
  SCAN_QR_CODE: {
    nivel: 'atencao',
    sufixo: 'aguardando QR',
    etiqueta: 'qr',
    // "PEDIDO AS", E NAO "EXPIRA AS". O `session.status` nao traz validade
    // nenhuma, e o WhatsApp renova o codigo sozinho sem mudar de estado — um
    // horario de expiracao seria chute com cara de dado.
    quando: 'Pedido às',
    recado: 'Escaneie logo — o código expira.',
  },
  FAILED: {
    nivel: 'ruim',
    sufixo: 'caiu',
    etiqueta: 'falha',
    quando: 'Desde',
    recado: 'Precisa reconectar pelo painel.',
  },
  STOPPED: {
    nivel: 'neutro',
    sufixo: 'desconectada',
    etiqueta: 'off',
    quando: 'Desde',
    // Desconectar costuma ser alguem clicando no painel, olhando a tela.
    silencioso: true,
  },
  UNKNOWN: {
    nivel: 'neutro',
    sufixo: 'em estado desconhecido',
    etiqueta: 'off',
    quando: 'Desde',
  },
};

/**
 * Janela da trava anti-enxurrada.
 *
 * Vale SO para o mesmo status na mesma sessao. Estados diferentes nunca sao
 * engolidos: `SCAN_QR_CODE` e `WORKING` chegam com segundos de diferenca e
 * sao as duas noticias que mais importam.
 */
const JANELA_REPETIDO_MS = 5 * 60_000;

@Injectable()
export class AvisarMudancaDeConexaoUseCase {
  private readonly logger = new Logger(AvisarMudancaDeConexaoUseCase.name);
  /** sessao -> ultimo status falado e quando. So anti-enxurrada. */
  private readonly ultimo = new Map<string, { status: string; em: number }>();
  /** sessao -> quando saiu do ar, para a volta dizer quanto tempo ficou. */
  private readonly caiuEm = new Map<string, Date>();
  /**
   * Sessoes que este processo JA VIU no ar.
   *
   * QUEM NUNCA SUBIU NAO CAIU — achado do Lucas em 10/11, no local. Ele
   * conectou uma vendedora pela PRIMEIRA vez e recebeu "Fora do ar: 8 min";
   * os oito minutos eram um teste que criou e apagou a sessao dela, e o back
   * dele, escutando o mesmo WAHA, guardou aquilo como hora da queda. Tratar
   * tudo que nao e `WORKING` como queda estava errado: `SCAN_QR_CODE` diz
   * justamente que a sessao NAO esta autenticada, e pode nunca ter estado.
   */
  private readonly esteveNoAr = new Set<string>();
  /**
   * Nomes ja avisados como desconhecidos.
   *
   * SILENCIO E O SINAL DE "ESTA TUDO BEM" DESTE SISTEMA, entao sessao
   * descartada precisa deixar rastro. Em producao o log e `info` e o `debug`
   * nao existe la: se `WAHA_SESSION_ELENA` estiver errada ou faltando, todo
   * evento da Helena cairia no `null` da lista de permissao sem deixar marca,
   * e o canal pareceria saudavel porque as outras sessoes seguem avisando.
   * Um `warn` por NOME, uma vez so, torna isso visivel sem virar enxurrada.
   */
  private readonly desconhecidas = new Set<string>();

  constructor(
    private readonly conexoes: ConexoesService,
    private readonly telegram: TelegramClient,
  ) {}

  async executar(evento: EventoDeStatus): Promise<void> {
    const fala = FALA[evento.status];
    if (!fala) return;

    // Lista de permissao: `null` e sessao que a casa nao reconhece — de teste,
    // criada na mao. O `/ws` entrega todas, e sobre essas nao se fala.
    const quem = await this.conexoes.identidadeDaSessao(evento.sessao);
    if (!quem) {
      if (!this.desconhecidas.has(evento.sessao)) {
        this.desconhecidas.add(evento.sessao);
        this.logger.warn(
          `Sessao "${evento.sessao}" nao e reconhecida pela casa: os eventos ` +
            'dela serao ignorados. Se isto e uma agente, confira WAHA_SESSION ' +
            'e WAHA_SESSION_ELENA.',
        );
      }
      return;
    }

    if (this.repetido(evento)) return;

    await this.telegram.enviar(fala.nivel, {
      titulo: `${quem.nome} ${fala.sufixo}`,
      subtitulo: quem.funcao,
      etiquetas: [fala.etiqueta],
      bloco: this.bloco(evento, fala, quem.orfa),
      recado: fala.recado,
      silencioso: fala.silencioso,
    });
  }

  private bloco(
    evento: EventoDeStatus,
    fala: Fala,
    orfa: boolean,
  ): LinhaDoBloco[] {
    const linhas: LinhaDoBloco[] = [];

    if (evento.status === 'WORKING') {
      this.esteveNoAr.add(evento.sessao);
      linhas.push({ rotulo: 'Número', valor: this.numero(evento.numero) });
      const caiu = this.caiuEm.get(evento.sessao);
      this.caiuEm.delete(evento.sessao);
      if (caiu) {
        linhas.push({
          rotulo:
            `Fora do ar: ${this.duracao(evento.em.getTime() - caiu.getTime())} ` +
            `(${this.hora(caiu)} → ${this.hora(evento.em)})`,
        });
      }
    } else {
      if (this.caiu(evento) && !this.caiuEm.has(evento.sessao)) {
        this.caiuEm.set(evento.sessao, evento.em);
      }
      linhas.push({ rotulo: 'Estado', valor: evento.status });
      linhas.push({ rotulo: `${fala.quando} ${this.hora(evento.em)}` });
    }

    // A ORFA NAO NOMEIA NINGUEM: sem o nome da sessao, dois orfaos dao dois
    // avisos identicos, e so a tela de Conexoes diria qual e qual — que e a
    // conferencia manual que isto existe para tirar.
    if (orfa) linhas.push({ rotulo: 'Sessão', valor: evento.sessao });

    return linhas;
  }

  /**
   * Este evento significa que a conexao CAIU — e nao so que nao esta no ar.
   *
   * `FAILED` so existe em sessao que estava autenticada: o vinculo quebrou,
   * entao caiu, mesmo que este processo nunca a tenha visto no ar.
   *
   * `SCAN_QR_CODE` diz o contrario — a sessao NAO esta autenticada. Pedir QR
   * nao e cair; e nunca ter subido, ou ja ter caido antes (e aí o `FAILED`
   * anterior ja marcou a hora).
   *
   * `STOPPED` e `UNKNOWN` sao ambiguos: so contam como queda se este processo
   * viu a sessao no ar antes.
   */
  private caiu(evento: EventoDeStatus): boolean {
    if (evento.status === 'FAILED') return true;
    if (evento.status === 'SCAN_QR_CODE') return false;
    return this.esteveNoAr.has(evento.sessao);
  }

  /** O mesmo status, na mesma sessao, dentro da janela. */
  private repetido(evento: EventoDeStatus): boolean {
    const visto = this.ultimo.get(evento.sessao);
    const agora = evento.em.getTime();
    if (
      visto &&
      visto.status === evento.status &&
      agora - visto.em < JANELA_REPETIDO_MS
    ) {
      return true;
    }
    this.ultimo.set(evento.sessao, { status: evento.status, em: agora });
    return false;
  }

  /** `5585920110403@c.us` vira `+55 85 92011-0403`. */
  private numero(numero: string | null): string {
    if (!numero) return 'não informado';
    const so = numero.split('@')[0].replace(/\D/g, '');
    const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(so);
    return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : so;
  }

  private duracao(ms: number): string {
    const min = Math.round(ms / 60_000);
    if (min < 1) return 'menos de 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const resto = min % 60;
    return resto ? `${h} h ${resto} min` : `${h} h`;
  }

  /** `HH:mm` no fuso da loja. */
  private hora(em: Date): string {
    const p = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO_DA_LOJA,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(em);
    const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${v('hour')}:${v('minute')}`;
  }
}
