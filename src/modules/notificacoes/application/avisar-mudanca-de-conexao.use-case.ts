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

/** Um estado pelo qual a sessao passou, com a hora que o WAHA carimbou. */
export interface MarcoDeStatus {
  status: string;
  em: Date;
}

export interface EventoDeStatus {
  sessao: string;
  status: string;
  /** So chega preenchido em WORKING. */
  numero: string | null;
  em: Date;
  /**
   * Os ultimos estados, do mais antigo ao mais novo, como o WAHA os manda
   * em `payload.statuses`. O ultimo e o deste evento.
   *
   * Pode faltar: WAHA antigo, payload torto. Quem le trata a ausencia.
   */
  historia?: MarcoDeStatus[];
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
    // A PALAVRA PADRAO E "CONECTADA". "Reconectada" so quando se SABE que
    // houve queda — pela historia do WAHA ou pela memoria do processo.
    sufixo: 'conectada',
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

/**
 * Quanto tempo parada ainda e piscada, e nao queda.
 *
 * O caso medido em 11/11 levou 216 MILESIMOS entre o STARTING e o WORKING.
 * Um minuto e folga larga de proposito: o que esta em jogo e nao chamar de
 * queda o que ninguem sentiu. Acima disso, alguem ficou sem atendimento, e
 * ai e noticia mesmo que tenha voltado sozinho.
 */
const PISCADA_MS = 60_000;

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

    const conteudo =
      evento.status === 'WORKING'
        ? this.daVolta(evento, fala)
        : this.daQueda(evento, fala);

    // So a piscada devolve `null`: o motor do WAHA refez a sessao sozinho e
    // nao ha noticia nenhuma para dar.
    if (!conteudo) return;

    // A ORFA NAO NOMEIA NINGUEM: sem o nome da sessao, dois orfaos dao dois
    // avisos identicos, e so a tela de Conexoes diria qual e qual — que e a
    // conferencia manual que isto existe para tirar.
    if (quem.orfa) {
      conteudo.linhas.push({ rotulo: 'Sessão', valor: evento.sessao });
    }

    await this.telegram.enviar(fala.nivel, {
      titulo: `${quem.nome} ${conteudo.sufixo}`,
      subtitulo: quem.funcao,
      etiquetas: [fala.etiqueta],
      bloco: conteudo.linhas,
      recado: fala.recado,
      silencioso: fala.silencioso,
    });
  }

  /**
   * A volta ao ar — e o unico caminho que pode decidir NAO falar.
   *
   * A palavra muda com o que se sabe: sem queda conhecida e "conectada". Ate
   * 11/11 todo WORKING dizia "reconectada", inclusive nas cinco mensagens em
   * que o proprio codigo sabia que nao houve queda — a linha "Fora do ar"
   * nao aparecia em nenhuma delas.
   */
  private daVolta(
    evento: EventoDeStatus,
    fala: Fala,
  ): { sufixo: string; linhas: LinhaDoBloco[] } | null {
    const lido = this.lerHistoria(evento);
    this.esteveNoAr.add(evento.sessao);

    const daMemoria = this.caiuEm.get(evento.sessao) ?? null;
    this.caiuEm.delete(evento.sessao);

    if (lido === 'piscada') return null;

    // A HISTORIA GANHA DA MEMORIA quando ela sabe: vem do WAHA e sobrevive
    // ao reinicio do back, que apaga os mapas daqui.
    const caiu = lido && lido !== 'estreia' ? lido.desde : daMemoria;

    const linhas: LinhaDoBloco[] = [
      { rotulo: 'Número', valor: this.numero(evento.numero) },
    ];
    if (caiu) {
      linhas.push({
        rotulo:
          `Fora do ar: ${this.duracao(evento.em.getTime() - caiu.getTime())} ` +
          `(${this.hora(caiu)} → ${this.hora(evento.em)})`,
      });
    }

    return { sufixo: caiu ? 'reconectada' : fala.sufixo, linhas };
  }

  /** Tudo que nao e WORKING: sempre fala, e guarda a hora quando e queda. */
  private daQueda(
    evento: EventoDeStatus,
    fala: Fala,
  ): { sufixo: string; linhas: LinhaDoBloco[] } {
    if (this.caiu(evento) && !this.caiuEm.has(evento.sessao)) {
      this.caiuEm.set(evento.sessao, evento.em);
    }

    return {
      sufixo: fala.sufixo,
      linhas: [
        { rotulo: 'Estado', valor: evento.status },
        { rotulo: `${fala.quando} ${this.hora(evento.em)}` },
      ],
    };
  }

  /**
   * O QUE A HISTORIA DO WAHA DIZ SOBRE ESTA VOLTA — 11/11/2026.
   *
   * Medido no `/ws` de producao as 16:45, no evento da KEYCIANE:
   *
   *     08:00:57  STARTING
   *     08:00:58  WORKING    (+0,691s)
   *     16:45:07  STARTING            <- 8,7 h depois
   *     16:45:08  WORKING    (+0,216s)
   *
   * O motor refez a sessao sozinho em 216 milesimos, com a credencial
   * guardada. A conta que NAO se faz aqui e o intervalo entre o WORKING
   * anterior e o STARTING: aquelas 8,7 horas sao o tempo em que ela esteve
   * NO AR, porque a lista so registra transicao.
   *
   * `null` quando a historia nao ajuda (WAHA antigo, payload torto, janela
   * curta demais) — ai vale a memoria do processo, como antes.
   */
  private lerHistoria(
    evento: EventoDeStatus,
  ): 'piscada' | 'estreia' | { desde: Date } | null {
    const h = evento.historia;
    if (!h || h.length < 2) return null;

    const agora = h[h.length - 1];
    if (agora.status !== 'WORKING') return null;

    // STARTING e estado de PASSAGEM: o que interessa e o que vinha antes
    // dele, e desde quando a sessao deixou de estar no ar.
    let i = h.length - 2;
    let parouEm = agora.em;
    while (i >= 0 && h[i].status === 'STARTING') {
      parouEm = h[i].em;
      i -= 1;
    }
    if (i < 0) return null;

    const antes = h[i];
    if (antes.status === 'WORKING') {
      const parada = agora.em.getTime() - parouEm.getTime();
      return parada < PISCADA_MS ? 'piscada' : { desde: parouEm };
    }
    if (antes.status === 'FAILED' || antes.status === 'STOPPED') {
      return { desde: antes.em };
    }
    // SCAN_QR_CODE: acabou de autenticar. Se houve queda antes, quem sabe e
    // a memoria — a janela de tres estados do WAHA ja nao alcanca.
    if (antes.status === 'SCAN_QR_CODE') return 'estreia';
    return null;
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
