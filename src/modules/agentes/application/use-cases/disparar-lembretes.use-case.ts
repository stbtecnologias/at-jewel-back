import { Inject, Injectable, Logger } from '@nestjs/common';
import { ADMIN_USER_REPOSITORY } from '../../../auth/domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../../auth/domain/ports/repositories/admin-user-repository.port';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { LEMBRETES_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ILembretesRepository,
  LembreteVencido,
} from '../../domain/ports/repositories/lembretes-repository.port';
import { quandoEmPalavras } from '../../../../shared/tempo/instante';

/** Quantos por rodada. Mesmo numero do disparo de pendencias. */
const LOTE = 50;

/**
 * Depois de quantas horas de atraso o lembrete deixa de valer.
 *
 * ==========================================================================
 * DOZE, E NAO SEIS COMO AS PENDENCIAS — a divergencia e de proposito.
 *
 * A pendencia de atendimento atrasada vira ruido: cobrar as 20h um contato
 * das 14h atrapalha mais do que ajuda, e a proxima rodada cobra de novo.
 *
 * O lembrete e o contrario. Ele nao se repete, e some-lo em silencio e
 * EXATAMENTE a falha que esta funcionalidade existe para evitar. Entao ele
 * chega atrasado, dizendo a hora original — quem pediu decide se ainda serve.
 *
 * O teto existe para o caso da queda longa: um lembrete de terca entregue na
 * quinta nao e lembrete, e susto. Passado ele, vira PERDIDO e aparece na
 * listagem dizendo que nao foi enviado — some da caixa de entrada, nao do
 * registro.
 * ==========================================================================
 */
const HORAS_MAXIMAS_ATRASO = 12;

type Desfecho = 'ENVIADO' | 'PERDIDO' | 'ADIADO';

/**
 * O CRON DOS LEMBRETES PESSOAIS — 30/09/2026.
 *
 * Molde: `DispararPendenciasUseCase`. O que muda e o destinatario (o proprio
 * dono, e nao a vendedora), o numero de origem (Anastasia) e a politica de
 * atraso, acima.
 */
@Injectable()
export class DispararLembretesUseCase {
  private readonly logger = new Logger(DispararLembretesUseCase.name);

  constructor(
    @Inject(LEMBRETES_REPOSITORY)
    private readonly lembretes: ILembretesRepository,
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly admins: IAdminUserRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
  ) {}

  async execute(
    agora = new Date(),
  ): Promise<{ enviados: number; perdidos: number }> {
    const vencidos = await this.lembretes.vencidos(agora, LOTE);
    if (vencidos.length === 0) return { enviados: 0, perdidos: 0 };

    let enviados = 0;
    let perdidos = 0;

    for (const lembrete of vencidos) {
      try {
        const desfecho = await this.disparar(lembrete, agora);
        if (desfecho === 'ENVIADO') enviados += 1;
        if (desfecho === 'PERDIDO') perdidos += 1;
      } catch (err) {
        // Um lembrete problematico nao trava a fila. Ele fica PENDENTE e volta
        // na proxima rodada — e, se o problema nao passar, o teto de atraso o
        // encerra em doze horas em vez de tentar para sempre.
        //
        // O TEXTO NAO ENTRA NO LOG, nem via `String(err)`: so o id e a
        // mensagem do erro.
        this.logger.error(
          `Falha ao disparar o lembrete ${lembrete.id}: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
        );
      }
    }

    if (enviados > 0 || perdidos > 0) {
      this.logger.log(
        `Lembretes: ${enviados} enviado(s), ${perdidos} perdido(s).`,
      );
    }
    return { enviados, perdidos };
  }

  private async disparar(
    lembrete: LembreteVencido,
    agora: Date,
  ): Promise<Desfecho> {
    const atrasoMs = agora.getTime() - lembrete.quando.getTime();
    if (atrasoMs > HORAS_MAXIMAS_ATRASO * 60 * 60_000) {
      await this.lembretes.fechar(lembrete.id, 'PERDIDO');
      this.logger.warn(
        `Lembrete ${lembrete.id} perdido: ${Math.round(atrasoMs / 3_600_000)}h de atraso.`,
      );
      return 'PERDIDO';
    }

    const dono = await this.admins.findById(lembrete.donoId);
    if (!dono?.telefone) {
      // ADIADO e nao PERDIDO: o cadastro pode ganhar o telefone a qualquer
      // momento, e ate la o teto de atraso e quem encerra.
      this.logger.warn(
        `Lembrete ${lembrete.id}: o dono nao tem telefone cadastrado.`,
      );
      return 'ADIADO';
    }

    const chatId = await this.whatsapp.resolverChatId(dono.telefone);
    if (!chatId) {
      this.logger.warn(
        `Lembrete ${lembrete.id}: o telefone do dono nao tem conta de WhatsApp.`,
      );
      return 'ADIADO';
    }

    await this.whatsapp.enviarTexto(
      chatId,
      montarTexto(lembrete, atrasoMs, agora),
      'ANASTASIA',
    );
    await this.lembretes.fechar(lembrete.id, 'ENVIADO');
    return 'ENVIADO';
  }
}

/**
 * O texto do lembrete, montado AQUI e nao pelo modelo.
 *
 * O conteudo e o que a pessoa escreveu, palavra por palavra — reescrever
 * "passar na Faby e pegar o bolo" como "comparecer ao estabelecimento" seria
 * devolver um lembrete que ela nao reconhece.
 *
 * O ATRASO E DITO, e nao escondido. Quem recebe as 11h um lembrete das 9h
 * precisa saber que sao 9h que passaram, senao age como se fosse agora.
 */
export function montarTexto(
  lembrete: { texto: string; quando: Date },
  atrasoMs: number,
  agora: Date,
): string {
  // Um minuto de folga: o cron roda a cada minuto, entao "na hora" nunca e
  // exato, e anunciar atraso de 40 segundos seria ruido.
  const atrasado = atrasoMs > 60_000;
  return atrasado
    ? `Lembrete de ${quandoEmPalavras(lembrete.quando, agora)}, que só chegou agora: ${lembrete.texto}`
    : `Lembrete: ${lembrete.texto}`;
}
