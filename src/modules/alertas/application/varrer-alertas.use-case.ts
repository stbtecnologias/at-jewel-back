import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ALERTA_REPOSITORY,
  type IAlertaRepository,
  type LeadEmAtraso,
  type RegraDeAlerta,
  type TipoDeAlvo,
} from '../domain/ports/alerta-repository.port';

/** O que uma rodada fez, para o log e para o teste. */
export interface ResultadoDaVarredura {
  avaliados: number;
  enviados: number;
  repetidos: number;
  falhas: number;
  /** Regras desligadas ou sem implementação, para o log dizer o que NÃO rodou. */
  ignoradas: string[];
}

/**
 * Quem recebe o alerta e o que ele diz.
 *
 * A PORTA DE ENVIO E UMA SO, e injetada: e o mesmo `WHATSAPP_GATEWAY` que
 * passou a ter teto de envio em 28/09. Um alerta que fugisse dele escaparia do
 * teto — e alerta em laco e exatamente o caso que o teto existe para conter.
 */
export interface EnviarAlerta {
  (destino: string, texto: string): Promise<void>;
}

/**
 * A VARREDURA DOS ALERTAS — ANA-19, ANA-04 e ANA-21.
 *
 * ==========================================================================
 * TRES COISAS PRECISAM SER VERDADE PARA UMA MENSAGEM SAIR DAQUI.
 *
 *   1. a regra existe e esta ATIVA           (ANA-20)
 *   2. o alvo passou do prazo                (ANA-19)
 *   3. ninguem ja avisou isso recentemente   (ANA-21)
 *
 * A terceira e a que costuma faltar, e a que transforma um alerta util num
 * repetidor: a varredura roda de hora em hora, e sem ela o mesmo lead parado
 * geraria um aviso por rodada — 24 por dia, para sempre. Depois do terceiro,
 * ninguem le o quarto, e o alerta que importava se perde no meio.
 *
 * O REGISTRO E DEPOIS DO ENVIO, NUNCA ANTES. Se o WhatsApp falhar e a gente
 * ja tiver registrado, o aviso some para sempre: a proxima rodada acha que
 * ja avisou. Registrar depois pode, no pior caso, mandar duas vezes — e
 * mandar duas vezes e melhor que nao mandar.
 * ==========================================================================
 */
@Injectable()
export class VarrerAlertasUseCase {
  private readonly logger = new Logger(VarrerAlertasUseCase.name);

  constructor(
    @Inject(ALERTA_REPOSITORY)
    private readonly alertas: IAlertaRepository,
  ) {}

  /**
   * @param enviar como a mensagem sai. Recebido em vez de injetado porque o
   *        destino muda por contexto (gestão hoje, vendedora depois), e
   *        porque assim o teste não precisa de um gateway falso inteiro.
   * @param destinos para onde o alerta vai. É a MESMA regra do aviso de lead
   *        que já existia: todo usuário de gestão com telefone cadastrado.
   *        Resolver isso aqui duplicaria o critério, e dois critérios de "quem
   *        é a gestão" divergem no dia em que alguém muda um papel.
   */
  async execute(
    enviar: EnviarAlerta,
    destinos: string[],
  ): Promise<ResultadoDaVarredura> {
    const r: ResultadoDaVarredura = {
      avaliados: 0,
      enviados: 0,
      repetidos: 0,
      falhas: 0,
      ignoradas: [],
    };

    if (destinos.length === 0) {
      // SEM DESTINO NAO HA ALERTA, e isso nao e erro: e o estado de quando
      // ninguem da gestao tem telefone cadastrado. Gritar no log a cada hora
      // faria o ruido que os proprios alertas existem para evitar.
      r.ignoradas.push('nenhum usuário de gestão com telefone');
      return r;
    }

    const regras = await this.alertas.listarRegras();

    for (const regra of regras) {
      if (!regra.ativo) {
        r.ignoradas.push(`${regra.chave} (desligada)`);
        continue;
      }

      const candidatos = await this.candidatosDe(regra);
      if (candidatos === null) {
        // A regra existe no banco mas ainda nao tem codigo que a calcule.
        // Dizer isso e melhor que fingir que ela rodou e nao achou nada.
        r.ignoradas.push(`${regra.chave} (sem implementação ainda)`);
        continue;
      }

      for (const lead of candidatos) {
        r.avaliados += 1;

        const jaAvisou = await this.alertas.jaAvisou(
          regra.chave,
          'LEAD',
          lead.leadId,
          regra.repetirAposMinutos,
        );
        if (jaAvisou) {
          r.repetidos += 1;
          continue;
        }

        try {
          const texto = this.texto(regra, lead);
          // UM ENVIO POR PESSOA, e o registro so DEPOIS de todos. Registrar
          // por destinatario faria a falha do segundo envio deixar o alerta
          // pela metade e marcado como feito.
          for (const destino of destinos) {
            await enviar(destino, texto);
          }
          await this.alertas.registrarDisparo({
            regra: regra.chave,
            alvoTipo: 'LEAD' as TipoDeAlvo,
            alvoId: lead.leadId,
            destinatario: destinos.join(', '),
          });
          r.enviados += 1;
        } catch (err) {
          r.falhas += 1;
          this.logger.error(
            `Alerta ${regra.chave} do lead ${lead.leadId} falhou: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    return r;
  }

  /**
   * Os candidatos de cada regra.
   *
   * `null` significa "esta regra ainda nao tem codigo", e e diferente de `[]`,
   * que significa "rodou e nao achou ninguem". As duas linhas do log sao
   * diferentes, e confundi-las esconderia um alerta que nunca dispara.
   *
   * `meta_em_risco` e `queda_de_desempenho` estao na tabela e voltam `null` de
   * proposito: os dois dependem de um LIMIAR que e decisao de negocio — quanto
   * e "longe da meta", quanto e "vendendo bem menos". Inventar o numero seria
   * escolher no lugar de quem responde pela operacao.
   */
  private async candidatosDe(
    regra: RegraDeAlerta,
  ): Promise<LeadEmAtraso[] | null> {
    const limite = new Date(Date.now() - regra.prazoMinutos * 60_000);

    switch (regra.chave) {
      case 'lead_sem_resposta':
        return this.alertas.leadsSemResposta(limite);
      case 'lead_parado':
        return this.alertas.leadsParados(limite);
      default:
        return null;
    }
  }

  /**
   * O texto do alerta.
   *
   * ==========================================================================
   * O ALERTA DIZ O QUE ACONTECEU E O QUE FAZER, e cabe numa olhada.
   *
   * Sem o "o que fazer", quem recebe precisa decidir na hora, e alerta que
   * exige decisao no ato vira alerta ignorado. Sem o tempo, nao da para saber
   * se e urgente. Sem o nome, nao da para agir sem abrir o sistema.
   *
   * O TELEFONE DA CLIENTE NAO ENTRA. Ele esta cifrado, o alerta vai para um
   * grupo, e quem precisa dele abre o lead — a mesma regra do aviso de lead
   * novo, que ja existia.
   * ==========================================================================
   */
  private texto(regra: RegraDeAlerta, lead: LeadEmAtraso): string {
    const quem = lead.nome ?? 'Um lead sem nome';
    const quanto = emHoras(lead.minutosParado);
    const dona = lead.vendedoraNome ? ` (${lead.vendedoraNome})` : '';

    if (regra.chave === 'lead_sem_resposta') {
      return (
        `⏰ ${quem}${dona} chegou há ${quanto} e ninguém respondeu ainda. ` +
        `Vale alguém assumir agora.`
      );
    }

    return (
      `💤 ${quem}${dona} está parado há ${quanto}, sem desfecho. ` +
      `Vale retomar ou marcar como perdido.`
    );
  }
}

/**
 * Minutos em algo que se le de relance.
 *
 * O alerta chega no WhatsApp e concorre com a conversa do dia: "10080 minutos"
 * exige conta, e quem faz conta nao age.
 */
export function emHoras(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 48 * 60) {
    const h = Math.round(minutos / 60);
    return `${h}h`;
  }
  const dias = Math.round(minutos / (24 * 60));
  return `${dias} dias`;
}
