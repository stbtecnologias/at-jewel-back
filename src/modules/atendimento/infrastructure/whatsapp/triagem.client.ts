import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Teto de espera do repasse. Ver o comentario de `encaminhar`. */
const TIMEOUT_MS = 5_000;

/**
 * Repassa para a TRIAGEM (`atwpp`) a mensagem de quem o canal interno nao
 * reconheceu.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE: UM NUMERO SO, DOIS PUBLICOS.
 *
 * Cliente, vendedora e gestao escrevem para o MESMO WhatsApp, entao o WAHA tem
 * uma sessao so e um webhook so — nao ha como mandar cada publico para um
 * servico diferente pela configuracao.
 *
 * Ate aqui isso obrigava a escolher: com o webhook no back, vendedora e gestao
 * eram atendidas e o CLIENTE ficava mudo; apontando para o `atwpp`, a triagem
 * funcionava e o canal interno inteiro parava. Alternar entre os dois era o
 * unico jeito de testar cada lado.
 *
 * Agora o back e a PORTA: reconhece quem escreve, atende quem e da casa, e
 * entrega o resto para a triagem. Cada servico continua dono do que ja sabe
 * fazer — o back conhece vendedora e gestao, o `atwpp` conhece o cliente.
 * ==========================================================================
 *
 * O CORPO VAI COMO VEIO, sem traduzir. O `atwpp` espera o payload do WAHA, e
 * reempacotar aqui criaria um segundo formato para manter — que divergiria na
 * primeira vez que o WAHA mudasse um campo. De quebra, a `session` viaja junto,
 * e e por ela que o `atwpp` decide por qual numero responder.
 */
@Injectable()
export class TriagemClient {
  private readonly logger = new Logger(TriagemClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Sem URL configurada, o repasse simplesmente nao acontece (silencio). */
  disponivel(): boolean {
    return Boolean(this.config.get<string>('TRIAGEM_WEBHOOK_URL')?.trim());
  }

  /**
   * NAO ESPERE POR ISTO. O `atwpp` responde de forma SINCRONA: ele chama o
   * LLM e so entao devolve o HTTP, o que leva segundos. Se o webhook do back
   * aguardasse, o WAHA veria uma requisicao lenta e entraria em retry — a
   * cliente receberia a mesma pergunta duas vezes.
   *
   * Entao quem chama dispara e devolve 200 na hora. O que der errado aqui vai
   * para o log, e nunca para a resposta do webhook.
   */
  async encaminhar(corpo: unknown): Promise<void> {
    const url = this.config.get<string>('TRIAGEM_WEBHOOK_URL')?.trim();
    if (!url) return;

    // Token proprio quando os dois servicos usam valores diferentes; se nao
    // houver, vale o mesmo token do webhook de entrada — que e o caso quando
    // WAHA, back e `atwpp` compartilham o segredo.
    const token =
      this.config.get<string>('TRIAGEM_WEBHOOK_TOKEN')?.trim() ||
      this.config.get<string>('WHATSAPP_WEBHOOK_TOKEN')?.trim();

    const controle = new AbortController();
    const alarme = setTimeout(() => controle.abort(), TIMEOUT_MS);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Webhook-Token': token } : {}),
        },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });

      // 401 aqui e quase sempre a MESMA causa: o token do `atwpp` nao e o que
      // o back esta mandando. Vale dizer isso no log, senao o sintoma e a
      // cliente sem resposta e nenhuma pista de onde olhar.
      if (resp.status === 401) {
        this.logger.error(
          'Triagem recusou o repasse (401) — o X-Webhook-Token do atwpp nao ' +
            'confere com o que o back envia.',
        );
        return;
      }
      if (!resp.ok) {
        this.logger.error(`Triagem respondeu ${resp.status} ao repasse.`);
      }
    } catch (err) {
      const abortou = err instanceof Error && err.name === 'AbortError';
      this.logger.error(
        abortou
          ? `Triagem nao respondeu em ${TIMEOUT_MS}ms — repasse abandonado.`
          : `Falha ao repassar para a triagem: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      clearTimeout(alarme);
    }
  }
}
