import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessoesDaCasaService } from '../../application/sessoes-da-casa.service';
import type { AgenteDaCasa } from '../../domain/agente-da-casa';
import type { IWhatsappGateway } from '../../domain/ports/whatsapp-gateway.port';
import { montarUrlDeArquivo } from './arquivo-do-waha';

/** Por quanto tempo o telefone de uma sessao vale sem perguntar de novo. */
const TTL_NUMERO_MS = 10 * 60_000;

/**
 * Gateway de WhatsApp via WAHA (WhatsApp HTTP API, self-hosted).
 * Envia mensagens pela send API do WAHA, autenticando por `X-Api-Key`.
 * Config via env: WAHA_BASE_URL, WAHA_API_KEY, WAHA_SESSION e
 * WAHA_SESSION_ELENA (ver `SessoesDaCasaService`).
 *
 * ==========================================================================
 * ESTE ARQUIVO SO FALA PELOS NUMEROS DA CASA, E ISSO E UMA GARANTIA.
 *
 * Em 08/09/2026 as sessoes viraram varias — uma por vendedora, alem da loja —
 * e o `WahaAdminClient` passou a receber qual delas como argumento. Aqui nao:
 * este e o objeto que FALA, e enquanto ele so soubesse enviar pelo
 * `WAHA_SESSION` nao existia caminho de codigo capaz de mandar mensagem pelo
 * numero de uma vendedora.
 *
 * EM 25/09/2026 A CASA PASSOU A TER DOIS NUMEROS, e o comentario acima previa
 * este dia: "se um dia for preciso enviar por outra sessao, isso e uma decisao
 * de produto". Foi tomada — Anastasia para a gestao, Elena para as vendedoras.
 *
 * A GARANTIA NAO AFROUXOU, MUDOU DE FORMA. Quem chama nao diz mais uma sessao:
 * diz um AGENTE, e so existem dois. A traducao para o nome tecnico acontece
 * aqui dentro, pelo `SessoesDaCasaService`, e nao ha string de sessao vinda de
 * fora em lugar nenhum. Uma tool de agente mal escrita amanha nao tem como
 * pedir `vend-<uuid>`, porque `vend-<uuid>` nao e um valor que o tipo aceite.
 *
 * E a terceira das tres camadas descritas em `WahaAdminClient.conectar`.
 * ==========================================================================
 */
@Injectable()
export class WahaGateway implements IWhatsappGateway {
  private readonly logger = new Logger(WahaGateway.name);
  /** Cache do telefone de cada sessao — ver `numeroDoAgente`. */
  private readonly numeros = new Map<string, { numero: string | null; em: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly sessoes: SessoesDaCasaService,
  ) {}

  /**
   * O telefone conectado numa das sessoes da casa.
   *
   * GUARDADO POR ALGUNS MINUTOS: o numero de um chip nao muda, e sem cache
   * todo desvio pagaria uma ida ao WAHA. O TTL curto existe so para o dia em
   * que alguem TROCAR o chip — a frase se corrige sozinha, sem restart.
   */
  async numeroDoAgente(agente: AgenteDaCasa): Promise<string | null> {
    const sessao = this.sessoes.sessaoDe(agente);
    const guardado = this.numeros.get(sessao);
    if (guardado && Date.now() - guardado.em < TTL_NUMERO_MS) {
      return guardado.numero;
    }

    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    if (!baseUrl || !apiKey) return null;

    try {
      const resp = await fetch(
        `${baseUrl.replace(/\/$/, '')}/api/sessions/${encodeURIComponent(sessao)}`,
        { headers: { 'X-Api-Key': apiKey } },
      );
      if (!resp.ok) return null;
      const dados = (await resp.json()) as { me?: { id?: string } | null };
      // `me.id` vem como `558598490118@c.us`; so os digitos interessam.
      const numero = dados.me?.id?.replace(/\D/g, '') || null;
      this.numeros.set(sessao, { numero, em: Date.now() });
      return numero;
    } catch (err) {
      // Sem numero o desvio ainda acontece, so que sem dizer qual — melhor
      // que nao desviar.
      this.logger.warn(
        `Nao consegui ler o numero da sessao "${sessao}": ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async resolverChatId(telefone: string): Promise<string | null> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    // CONSULTA, e nao envio: "este telefone tem WhatsApp?" tem a mesma
    // resposta em qualquer sessao da casa. Fica na da Anastasia, que e a que
    // sempre existe — a da Elena pode nem estar configurada ainda.
    const session = this.sessoes.anastasia;

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — chatId nao resolvido.',
      );
      return null;
    }

    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length === 0) return null;

    const url =
      `${baseUrl.replace(/\/$/, '')}/api/contacts/check-exists` +
      `?phone=${encodeURIComponent(digitos)}&session=${encodeURIComponent(session)}`;

    const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
    if (!resp.ok) {
      this.logger.error(`WAHA check-exists falhou: ${resp.status}`);
      throw new Error(`WAHA check-exists retornou ${resp.status}`);
    }

    const dados = (await resp.json()) as {
      numberExists?: boolean;
      chatId?: string;
    };
    if (!dados.numberExists || !dados.chatId) return null;
    return dados.chatId;
  }

  /**
   * @see SessoesDaCasaService — a traducao de LID e CONSULTA, entao pergunta
   * pela sessao da Anastasia, a que sempre existe. O LID e do contato, nao do
   * numero da casa: a resposta e a mesma pelos dois.
   */
  async resolverRemetente(de: string): Promise<string> {
    if (!de.endsWith('@lid')) return de;

    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    const session = this.sessoes.anastasia;

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — LID nao resolvido.',
      );
      return de;
    }

    const url =
      `${baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(session)}` +
      `/lids/${encodeURIComponent(de)}`;

    try {
      const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
      if (!resp.ok) {
        this.logger.warn(
          `WAHA lids retornou ${resp.status} — LID nao resolvido.`,
        );
        return de;
      }
      const dados = (await resp.json()) as { pn?: string };
      return dados.pn ?? de;
    } catch (err) {
      // Nunca derruba o webhook: sem traducao o remetente so nao e
      // reconhecido, e o canal e default-deny de qualquer forma.
      this.logger.warn(
        `Falha ao resolver LID: ${err instanceof Error ? err.message : err}`,
      );
      return de;
    }
  }

  async enviarTexto(
    chatId: string,
    texto: string,
    agente: AgenteDaCasa = 'ANASTASIA',
  ): Promise<void> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    const session = this.sessoes.sessaoDe(agente);

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — resposta nao enviada.',
      );
      return;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/api/sendText`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ session, chatId, text: texto }),
    });

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      // Nao logamos o texto da mensagem (pode conter PII); so o status/erro.
      this.logger.error(
        `WAHA sendText falhou: ${resp.status} ${corpo.slice(0, 200)}`,
      );
      throw new Error(`WAHA sendText retornou ${resp.status}`);
    }
  }

  async enviarImagem(
    chatId: string,
    conteudo: Buffer,
    mime: string,
    legenda: string,
    agente: AgenteDaCasa = 'ANASTASIA',
  ): Promise<void> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    const session = this.sessoes.sessaoDe(agente);

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — imagem nao enviada.',
      );
      return;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/api/sendImage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({
        session,
        chatId,
        file: {
          mimetype: mime,
          // BASE64, e nao URL: a imagem esta num bucket privado, e o WhatsApp
          // nao teria como baixa-la de la.
          data: conteudo.toString('base64'),
          filename: 'peca.png',
        },
        caption: legenda,
      }),
    });

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      this.logger.error(
        `WAHA sendImage falhou: ${resp.status} ${corpo.slice(0, 200)}`,
      );
      throw new Error(`WAHA sendImage retornou ${resp.status}`);
    }
  }

  async baixarMidia(
    url: string,
  ): Promise<{ conteudo: Buffer; mimetype: string } | null> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — midia nao baixada.',
      );
      return null;
    }

    const alvo = montarUrlDeArquivo(baseUrl, url);
    if (!alvo) {
      // Ver `montarUrlDeArquivo`: caminho fora de /api/files nao e nosso.
      this.logger.warn(
        'URL de midia com caminho inesperado — download recusado.',
      );
      return null;
    }

    try {
      const resp = await fetch(alvo, {
        headers: { 'X-Api-Key': apiKey },
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) {
        this.logger.error(`WAHA download de midia falhou: ${resp.status}`);
        return null;
      }
      const conteudo = Buffer.from(await resp.arrayBuffer());
      const mimetype =
        resp.headers.get('content-type') ?? 'application/octet-stream';
      return { conteudo, mimetype };
    } catch (err) {
      // Igual ao resolverRemetente: nunca derruba o webhook. Sem o audio, a
      // mensagem so nao e entendida.
      this.logger.error(
        `Falha ao baixar midia do WAHA: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }
}

