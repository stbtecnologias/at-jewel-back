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
  /** Texto da mensagem. Vazio quando veio audio puro. */
  texto: string;
  /** Presente so quando a mensagem e de audio. */
  audio?: AudioRecebido;
}

/**
 * Extrai uma mensagem RECEBIDA a partir do corpo do webhook do WAHA. Retorna
 * null quando o evento deve ser ignorado:
 * - nao e evento de mensagem;
 * - e mensagem enviada por nos mesmos (fromMe);
 * - e de grupo (`@g.us`) — o canal so trata conversas diretas;
 * - nao tem remetente;
 * - nao tem nem texto nem audio (foto, documento, sticker, evento de status).
 *
 * AUDIO — acrescentado em 21/08/2026. Ate entao qualquer mensagem sem texto
 * era descartada aqui, em silencio: quem mandava audio nao recebia resposta
 * nenhuma e nem sabia por que. O audio de voz do WhatsApp chega como `ptt`
 * (push-to-talk), SEM campo `body` algum, com o arquivo em `media.url`.
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

  // Sem texto e sem audio nao ha o que processar. Foto, documento e sticker
  // caem aqui — e continuam sendo ignorados de proposito.
  if (!texto.trim() && !audio) return null;

  return audio ? { de, texto, audio } : { de, texto };
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
