import { Injectable, Logger } from '@nestjs/common';
import { ConexoesService } from '../../atendimento/application/conexoes.service';
import { FUSO_DA_LOJA } from '../../../shared/erp/data-do-erp';
import {
  TelegramClient,
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
 * NAO HA MEMORIA DE ESTADO AQUI, e e decisao dele: *"o estado que esta agora
 * fica sem nada alertado"*. O ouvinte sobe e espera. O `ultimo` abaixo e
 * trava anti-enxurrada, nao deteccao de mudanca — quem detecta mudanca e o
 * WAHA, que so manda evento quando algo muda.
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
  sufixo: string;
  recado?: string;
}

/**
 * `STARTING` NAO APARECE AQUI, e e de proposito.
 *
 * Na medicao de 10/11 ele chegou UM SEGUNDO antes do `SCAN_QR_CODE`: avisar
 * os dois seria mensagem dobrada para um acontecimento so.
 */
const FALA: Record<string, Fala> = {
  WORKING: { nivel: 'bom', sufixo: 'reconectada' },
  SCAN_QR_CODE: {
    nivel: 'atencao',
    sufixo: 'esperando leitura do QR',
    recado: 'O código expira — escaneie logo.',
  },
  FAILED: {
    nivel: 'ruim',
    sufixo: 'caiu',
    recado: 'Precisa reconectar pelo painel.',
  },
  STOPPED: { nivel: 'neutro', sufixo: 'desconectada' },
  UNKNOWN: { nivel: 'neutro', sufixo: 'em estado desconhecido' },
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

  constructor(
    private readonly conexoes: ConexoesService,
    private readonly telegram: TelegramClient,
  ) {}

  async executar(evento: EventoDeStatus): Promise<void> {
    const fala = FALA[evento.status];
    if (!fala) return;

    // Lista de permissao: `null` e sessao que a casa nao reconhece — de teste,
    // criada na mao. O `/ws` entrega todas, e sobre essas nao se fala.
    const rotulo = await this.conexoes.rotuloDaSessao(evento.sessao);
    if (!rotulo) {
      this.logger.debug(
        `Sessao "${evento.sessao}" nao e nossa: ${evento.status} ignorado.`,
      );
      return;
    }

    if (this.repetido(evento)) return;

    const linhas =
      evento.status === 'WORKING'
        ? [`Número ${this.numeroLimpo(evento.numero)} · ${this.quando(evento.em)}`]
        : [`Estado: ${evento.status} · ${this.quando(evento.em)}`];
    if (fala.recado) linhas.push(fala.recado);

    await this.telegram.enviar(fala.nivel, `${rotulo} ${fala.sufixo}`, linhas);
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

  /** `5585920110403@c.us` vira `5585920110403`. */
  private numeroLimpo(numero: string | null): string {
    if (!numero) return 'não informado';
    return numero.split('@')[0];
  }

  /** `dd/MM HH:mm` no fuso da loja. */
  private quando(em: Date): string {
    const p = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO_DA_LOJA,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(em);
    const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`;
  }
}
