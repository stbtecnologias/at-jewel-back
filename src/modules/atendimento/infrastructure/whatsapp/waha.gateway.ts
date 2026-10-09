import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LimiteDeEnvioService } from '../../application/limite-de-envio.service';
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
  /**
   * Cache da identidade de cada sessao — ver `identidadeDaSessao`.
   *
   * Telefone e lid ficam JUNTOS porque saem da mesma resposta do WAHA. Dois
   * caches separados fariam duas idas para buscar o que ja tinha vindo.
   */
  private readonly identidades = new Map<
    string,
    { numero: string | null; lid: string | null; em: number }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly sessoes: SessoesDaCasaService,
    private readonly limite: LimiteDeEnvioService,
  ) {}

  /**
   * Quem e a sessao — telefone e `@lid` — direto do WAHA.
   *
   * GUARDADO POR ALGUNS MINUTOS: nem o numero nem o lid de um chip mudam, e
   * sem cache cada mensagem de grupo pagaria uma ida ao WAHA. O TTL curto
   * existe so para o dia em que alguem TROCAR o chip — ai se corrige sozinho,
   * sem restart.
   */
  private async identidadeDaSessao(
    agente: AgenteDaCasa,
  ): Promise<{ numero: string | null; lid: string | null }> {
    const sessao = this.sessoes.sessaoDe(agente);
    const guardado = this.identidades.get(sessao);
    if (guardado && Date.now() - guardado.em < TTL_NUMERO_MS) return guardado;

    const vazio = { numero: null, lid: null };
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    if (!baseUrl || !apiKey) return vazio;

    try {
      const resp = await fetch(
        `${baseUrl.replace(/\/$/, '')}/api/sessions/${encodeURIComponent(sessao)}`,
        { headers: { 'X-Api-Key': apiKey } },
      );
      if (!resp.ok) return vazio;
      const dados = (await resp.json()) as {
        me?: { id?: string; lid?: string } | null;
      };
      // `me.id` vem como `558598490118@c.us` e `me.lid` como `1582...@lid`;
      // so os digitos interessam, dos dois.
      const identidade = {
        numero: dados.me?.id?.replace(/\D/g, '') || null,
        lid: dados.me?.lid?.replace(/\D/g, '') || null,
      };
      this.identidades.set(sessao, { ...identidade, em: Date.now() });
      return identidade;
    } catch (err) {
      // Sem identidade o desvio ainda acontece, so que sem dizer qual numero —
      // melhor que nao desviar. E no grupo ela so deixa de ser reconhecida,
      // o que a mantem CALADA: o lado seguro do "nao sei".
      this.logger.warn(
        `Nao consegui ler a identidade da sessao "${sessao}": ${err instanceof Error ? err.message : err}`,
      );
      return vazio;
    }
  }

  async numeroDoAgente(agente: AgenteDaCasa): Promise<string | null> {
    return (await this.identidadeDaSessao(agente)).numero;
  }

  /**
   * O `@lid` da propria sessao, so digitos — para saber se FOI ELA a
   * mencionada num grupo.
   *
   * A mencao chega como `@lid` e a sessao sabe o proprio: comparar lid com lid
   * dispensa traduzir, e traduzir custaria uma ida ao WAHA por mencao.
   */
  async lidDoAgente(agente: AgenteDaCasa): Promise<string | null> {
    return (await this.identidadeDaSessao(agente)).lid;
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
   * @param agente a sessao POR ONDE a mensagem chegou. Ver o bloco abaixo.
   */
  async resolverRemetente(de: string, agente?: AgenteDaCasa): Promise<string> {
    if (!de.endsWith('@lid')) return de;

    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — LID nao resolvido.',
      );
      return de;
    }

    // ====================================================================
    // A SESSAO DE ORIGEM VEM PRIMEIRO — 07/10/2026.
    //
    // Ate hoje isto perguntava SEMPRE pela sessao da Anastasia, com a
    // justificativa de que "o LID e do contato, nao do numero da casa: a
    // resposta e a mesma pelos dois". A premissa estava errada: o mapa de
    // LIDs e POR CONTA, e so tem quem aquela conta ja viu.
    //
    // O CUSTO FOI SILENCIO. A Nathalia escreveu para a Helena (a Elena do
    // codigo) e nao recebeu nada: o LID dela nunca tinha passado pela conta
    // da Anastasia, o WAHA devolveu 404, a funcao devolveu o proprio LID, e
    // o LID nao casa com telefone nenhum no cadastro — remetente nao
    // reconhecido, e o canal e default-deny. O Lucas, no mesmo teste, foi
    // respondido: ele fala com a Anastasia, entao o LID dele estava la.
    //
    // AS OUTRAS SESSOES CONTINUAM SENDO TENTADAS, em segundo lugar: um LID
    // que a conta de origem ainda nao viu pode estar na irma, e uma chamada
    // a mais so acontece quando a primeira falhou. O contrario — desistir na
    // primeira — trocaria um silencio por outro.
    // ====================================================================
    const preferida = this.sessoes.sessaoDe(agente ?? 'ANASTASIA');
    const sessoes = [
      preferida,
      ...this.sessoes.todas.filter((s) => s !== preferida),
    ];

    for (const session of sessoes) {
      const telefone = await this.perguntarLid(baseUrl, apiKey, session, de);
      if (telefone) return telefone;
    }

    // NAO E DEBUG: este aviso e a unica pista de um canal que emudeceu, e
    // quem investiga nem sempre alcanca o container. So o formato e a
    // contagem — nunca o LID, que identifica a pessoa.
    this.logger.warn(
      `LID nao resolvido em nenhuma das ${sessoes.length} sessao(oes) da casa — ` +
        'o remetente nao sera reconhecido.',
    );
    return de;
  }

  /** Uma pergunta ao mapa de LIDs de UMA sessao. `null` = esta nao sabe. */
  private async perguntarLid(
    baseUrl: string,
    apiKey: string,
    session: string,
    lid: string,
  ): Promise<string | null> {
    const url =
      `${baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(session)}` +
      `/lids/${encodeURIComponent(lid)}`;

    try {
      const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
      if (!resp.ok) {
        this.logger.warn(
          `WAHA lids na sessao "${session}" retornou ${resp.status}.`,
        );
        return null;
      }
      const dados = (await resp.json()) as { pn?: string };
      return dados.pn ?? null;
    } catch (err) {
      // Nunca derruba o webhook: sem traducao o remetente so nao e
      // reconhecido, e o canal e default-deny de qualquer forma.
      this.logger.warn(
        `Falha ao resolver LID na sessao "${session}": ${err instanceof Error ? err.message : err}`,
      );
      return null;
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

    // O TETO DE ENVIO (RF-12) MORA AQUI porque este e o unico lugar por onde
    // toda mensagem passa — agente, agendador, aviso de lead, catalogo. Posto
    // em qualquer caso de uso, sobraria o proximo caso de uso sem ele.
    //
    // Depois da guarda de configuracao de proposito: sem WAHA nada e enviado,
    // e contar tentativa que nao saiu encheria a janela a toa.
    this.limite.registrar(chatId, session);

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

    // Imagem conta no MESMO teto do texto: para a Meta e uma mensagem, e o
    // que dispara bloqueio e o volume, nao o formato.
    this.limite.registrar(chatId, session);

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

  /**
   * O "digitando..." — 08/10/2026. Ver o contrato na porta.
   *
   * ======================================================================
   * NAO CONTA NO TETO DE ENVIO, e essa e a diferenca em relacao ao
   * `enviarTexto`.
   *
   * O `RF-12` conta MENSAGEM, porque e o volume de mensagem que dispara
   * bloqueio na Meta. Presenca nao e mensagem: nao chega como notificacao,
   * nao fica no historico, e renovar o indicador a cada dez segundos
   * encheria a janela do teto a toa — e aí a resposta DE VERDADE seria
   * recusada por causa do aviso de que ela estava vindo.
   * ======================================================================
   */
  async iniciarDigitando(
    chatId: string,
    agente: AgenteDaCasa = 'ANASTASIA',
  ): Promise<void> {
    await this.presenca('startTyping', chatId, agente);
  }

  async pararDigitando(
    chatId: string,
    agente: AgenteDaCasa = 'ANASTASIA',
  ): Promise<void> {
    await this.presenca('stopTyping', chatId, agente);
  }

  /**
   * Os dois endpoints de presenca, que sao a mesma chamada com outro nome.
   *
   * ENGOLE TODO ERRO, de proposito e ao contrario do `enviarTexto`: mostrar
   * que esta pensando e enfeite, e enfeite que falha nao pode impedir a
   * resposta de sair. O pior desfecho aceitavel e ela esperar sem ver o
   * aviso — exatamente como era antes de isto existir.
   *
   * So METADADO no log: o chatId e PII.
   */
  private async presenca(
    acao: 'startTyping' | 'stopTyping',
    chatId: string,
    agente: AgenteDaCasa,
  ): Promise<void> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    if (!baseUrl || !apiKey) return;

    try {
      const url = `${baseUrl.replace(/\/$/, '')}/api/${acao}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({
          session: this.sessoes.sessaoDe(agente),
          chatId,
        }),
      });
      if (!resp.ok) {
        this.logger.debug(`WAHA ${acao} devolveu ${resp.status}.`);
      }
    } catch (err) {
      this.logger.debug(
        `WAHA ${acao} falhou: ${err instanceof Error ? err.message : err}`,
      );
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

