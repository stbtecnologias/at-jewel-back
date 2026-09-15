/**
 * Shape (parcial) do evento que o WAHA envia ao webhook. O payload e amplo e
 * varia por engine/versao; tipamos apenas o que usamos e parseamos defensivo.
 */
interface WahaWebhookBody {
  event?: string;
  session?: string;
  payload?: {
    from?: string;
    fromMe?: boolean;
    body?: string;
    hasMedia?: boolean;
    /** Quando a mensagem foi escrita, em SEGUNDOS. */
    timestamp?: number;
    media?: { url?: string; mimetype?: string } | null;
    _data?: {
      Info?: { Type?: string; MediaType?: string };
      Message?: { audioMessage?: { mimetype?: string; seconds?: number } };
    };
    [k: string]: unknown;
  };
}

/**
 * Imagem que veio junto da mensagem.
 *
 * O ARQUIVO VIVE 30 MINUTOS. O WAHA republica a midia decifrada num endereco
 * proprio e a apaga depois de `WHATSAPP_FILES_LIFETIME` (1800s na instalacao
 * de hoje). Quem recebe isto tem que BAIXAR E GRAVAR ANTES de conversar: se a
 * pessoa demorar para responder "e do catalogo 0002", o original ja evaporou.
 */
export interface ImagemRecebida {
  /** Endereco do arquivo JA DESCRIPTOGRAFADO. `null` quando o WAHA nao baixou. */
  url: string | null;
  mimetype: string;
}

/** Audio que veio junto da mensagem, ja identificado como audio. */
export interface AudioRecebido {
  /**
   * Endereco do arquivo JA DESCRIPTOGRAFADO pelo WAHA.
   *
   * `null` quando o WAHA reconheceu o audio mas nao entregou o arquivo — e o
   * que acontece com o download de midia desligado. Vale distinguir de "nao ha
   * audio": aqui da para avisar a vendedora que chegou audio e nao deu para
   * ouvir, em vez de ficar mudo.
   */
  url: string | null;
  mimetype: string;
  /** Duracao em segundos, quando informada. Serve para recusar antes de baixar. */
  segundos: number | null;
}

export interface MensagemWhatsapp {
  /** Chat de origem (formato WhatsApp, ex.: `5585...@c.us`, ou um `@lid`). */
  de: string;
  /**
   * Texto da mensagem. Vazio quando veio audio puro. Quando ha IMAGEM, este e
   * a LEGENDA — o WhatsApp manda a legenda no mesmo campo `body` do texto.
   */
  texto: string;
  /** Presente so quando a mensagem e de audio. */
  audio?: AudioRecebido;
  /** Presente so quando a mensagem e de imagem. */
  imagem?: ImagemRecebida;
  /**
   * Quando a mensagem foi ESCRITA, em milissegundos — o carimbo do WhatsApp,
   * e nao a hora em que chegou aqui.
   *
   * Entrou em 11/09/2026 para o relogio da aprovacao do catalogo: uma
   * afirmacao so aprova foto que ja tinha chegado quando a pessoa escreveu.
   * Ausente quando o payload nao traz — e ai quem usa cai na hora de agora.
   */
  em?: number;
}

/**
 * De QUAL sessao veio o evento.
 *
 * ==========================================================================
 * ESTE CAMPO PASSOU A IMPORTAR EM 08/09/2026.
 *
 * Ate aqui havia UMA sessao, entao a resposta era sempre a mesma e ninguem
 * precisava perguntar. Agora ha uma sessao por vendedora, e a diferenca e de
 * vida ou morte: a sessao da LOJA fala com a IA; a de uma vendedora e SO
 * LEITURA, porque do outro lado esta uma cliente conversando com a vendedora
 * de verdade — e a Anastasia respondendo por cima disso seria a IA falando no
 * lugar dela, numa conversa que nao e dela.
 *
 * Quem decide o que fazer com esta informacao e o controller.
 * ==========================================================================
 *
 * @returns o nome da sessao, ou `null` quando o payload nao traz.
 */
export function sessaoDoEvento(body: unknown): string | null {
  const b = (body ?? {}) as WahaWebhookBody;
  return typeof b.session === 'string' && b.session !== '' ? b.session : null;
}

/**
 * O contato que passou pelo numero — quem falou com quem, e quando.
 *
 * ==========================================================================
 * DIFERENTE DE `extrairMensagemRecebida`, ESTE OLHA OS DOIS SENTIDOS.
 *
 * Aquele descarta `fromMe` de proposito: no canal da loja, mensagem nossa nao
 * deve ser processada de novo. Aqui a mensagem da vendedora IMPORTA — cliente
 * que escreve e nao recebe resposta e justamente o que a gestao precisa ver,
 * e sem o lado dela os dois casos ficariam identicos na regua.
 *
 * Quando `fromMe`, o outro lado esta em `to` e nao em `from`.
 * ==========================================================================
 *
 * @returns null quando o evento nao e um contato pessoa-a-pessoa: nao e
 *          mensagem, e de grupo, ou o identificador nao e um telefone.
 */
export function contatoDoEvento(body: unknown): {
  telefone: string;
  daVendedora: boolean;
  em: Date;
} | null {
  const b = (body ?? {}) as WahaWebhookBody & {
    payload?: { to?: string; timestamp?: number };
  };

  if (b.event && b.event !== 'message') return null;

  const payload = b.payload ?? {};
  const daVendedora = payload.fromMe === true;
  const outroLado = daVendedora ? payload.to : payload.from;
  if (typeof outroLado !== 'string' || !outroLado) return null;

  // Grupo nao e atendimento. E `@lid` tambem sai: o identificador escondido do
  // WhatsApp nao contem telefone, e traduzi-lo exigiria consultar a sessao DA
  // VENDEDORA — coisa que o gateway, preso ao numero da loja, nao sabe fazer.
  if (!outroLado.endsWith('@c.us')) return null;

  const digitos = outroLado.replace(/@.*$/, '');
  if (!/^\d{10,15}$/.test(digitos)) return null;

  return {
    telefone: digitos,
    daVendedora,
    // O WAHA manda o timestamp em SEGUNDOS. Sem ele, a hora de agora — que
    // erra por segundos, e nao por horas.
    em:
      typeof payload.timestamp === 'number'
        ? new Date(payload.timestamp * 1000)
        : new Date(),
  };
}

/**
 * Extrai uma mensagem RECEBIDA a partir do corpo do webhook do WAHA. Retorna
 * null quando o evento deve ser ignorado:
 * - nao e evento de mensagem;
 * - e mensagem enviada por nos mesmos (fromMe);
 * - e de grupo (`@g.us`) — o canal so trata conversas diretas;
 * - nao tem remetente;
 * - nao tem texto, nem audio, nem imagem (documento, sticker, evento de status).
 *
 * AUDIO — acrescentado em 21/08/2026. Ate entao qualquer mensagem sem texto
 * era descartada aqui, em silencio: quem mandava audio nao recebia resposta
 * nenhuma e nem sabia por que. O audio de voz do WhatsApp chega como `ptt`
 * (push-to-talk), SEM campo `body` algum, com o arquivo em `media.url`.
 *
 * IMAGEM — acrescentada em 28/08/2026, para o catalogo. Ate entao foto caia no
 * mesmo descarte silencioso do audio. Quem decide o que fazer com ela e o
 * ROTEADOR, nao este arquivo: aqui so se reconhece que ha imagem.
 */
export function extrairMensagemRecebida(body: unknown): MensagemWhatsapp | null {
  const b = (body ?? {}) as WahaWebhookBody;

  if (b.event && b.event !== 'message') return null;

  const payload = b.payload ?? {};
  const de = typeof payload.from === 'string' ? payload.from : '';
  const texto = typeof payload.body === 'string' ? payload.body : '';

  if (payload.fromMe === true) return null;
  if (!de || de.endsWith('@g.us')) return null;

  const audio = extrairAudio(payload);
  // Imagem so e procurada quando NAO ha audio: os dois usam `media`, e um
  // audio nunca deve ser confundido com foto.
  const imagem = audio ? null : extrairImagem(payload);

  // Sem texto, sem audio e sem imagem nao ha o que processar. Documento,
  // sticker e evento de status caem aqui, e continuam ignorados de proposito.
  if (!texto.trim() && !audio && !imagem) return null;

  const msg: MensagemWhatsapp = { de, texto };
  if (audio) msg.audio = audio;
  if (imagem) msg.imagem = imagem;
  // O WAHA manda o timestamp em SEGUNDOS — o mesmo campo que o
  // `contatoDoEvento` ja le para a regua da vendedora.
  if (typeof payload.timestamp === 'number' && payload.timestamp > 0) {
    msg.em = payload.timestamp * 1000;
  }
  return msg;
}

function extrairImagem(
  payload: NonNullable<WahaWebhookBody['payload']>,
): ImagemRecebida | null {
  const mediaType = String(payload._data?.Info?.MediaType ?? '').toLowerCase();
  const mimeDaMidia = payload.media?.mimetype ?? '';

  // Dois sinais independentes, porque o payload varia por engine e versao.
  // `sticker` fica de fora de proposito: e imagem, mas nunca e foto de peca.
  const ehImagem = mediaType === 'image' || mimeDaMidia.startsWith('image/');
  if (!ehImagem) return null;

  const url = typeof payload.media?.url === 'string' ? payload.media.url : null;
  return { url, mimetype: mimeDaMidia || 'image/jpeg' };
}

function extrairAudio(
  payload: NonNullable<WahaWebhookBody['payload']>,
): AudioRecebido | null {
  const audioMsg = payload._data?.Message?.audioMessage;
  const mediaType = String(payload._data?.Info?.MediaType ?? '').toLowerCase();
  const mimeDaMidia = payload.media?.mimetype ?? '';

  // Tres sinais independentes, porque o payload varia por engine e versao. Um
  // basta — mas exigir que ALGUM exista evita mandar foto para a transcricao.
  const ehAudio =
    Boolean(audioMsg) ||
    mediaType === 'ptt' ||
    mediaType === 'audio' ||
    mimeDaMidia.startsWith('audio');

  if (!ehAudio) return null;

  const url = typeof payload.media?.url === 'string' ? payload.media.url : null;
  const mimetype = mimeDaMidia || audioMsg?.mimetype || 'audio/ogg';
  const segundos =
    typeof audioMsg?.seconds === 'number' && audioMsg.seconds > 0
      ? audioMsg.seconds
      : null;

  return { url, mimetype, segundos };
}
