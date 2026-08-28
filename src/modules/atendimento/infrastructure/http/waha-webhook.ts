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
