import type { MensagemRecebida } from '../../application/use-cases/processar-mensagem-whatsapp.use-case';

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
    [k: string]: unknown;
  };
}

/**
 * Extrai uma mensagem de texto RECEBIDA de uma cliente a partir do corpo do
 * webhook do WAHA. Retorna null quando o evento deve ser ignorado:
 * - nao e evento de mensagem;
 * - e mensagem enviada por nos mesmos (fromMe);
 * - e de grupo (`@g.us`) — a triagem so trata conversas diretas;
 * - nao tem remetente ou texto.
 */
export function extrairMensagemRecebida(body: unknown): MensagemRecebida | null {
  const b = (body ?? {}) as WahaWebhookBody;

  if (b.event && b.event !== 'message') return null;

  const payload = b.payload ?? {};
  const de = typeof payload.from === 'string' ? payload.from : '';
  const texto = typeof payload.body === 'string' ? payload.body : '';

  if (payload.fromMe === true) return null;
  if (!de || de.endsWith('@g.us')) return null;
  if (!texto.trim()) return null;

  return { de, texto };
}
