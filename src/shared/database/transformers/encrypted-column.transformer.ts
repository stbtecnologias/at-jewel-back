import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Versao do formato do ciphertext. Permite rotacao futura de chave:
// quando ENCRYPTION_KEY mudar, ciphertexts antigos podem ser lidos com
// a chave legada e re-escritos com a chave nova, identificados pela versao.
//
// Formato atual (v1): "v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
// Formato legado (sem versao): "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
//   - aceito apenas na LEITURA, para compatibilidade com qualquer dado
//     que tenha sido escrito antes desta versao.
//
// Sempre escrevemos com prefixo de versao. Nunca produzir formato legado.
const CURRENT_KEY_VERSION = 'v1';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function getHmacSecret(): string {
  const secret = process.env.HASH_SECRET;
  if (!secret) throw new Error('HASH_SECRET env var is required');
  return secret;
}

// Parse aceita formato v1 (com prefixo) e legado (sem prefixo, 3 segmentos).
// Retorna null se o input nao for nenhum dos dois.
function parseCiphertext(value: string): { iv: Buffer; authTag: Buffer; data: Buffer } | null {
  const parts = value.split(':');

  let ivHex: string, authTagHex: string, dataHex: string;

  if (parts.length === 4 && parts[0] === CURRENT_KEY_VERSION) {
    [, ivHex, authTagHex, dataHex] = parts;
  } else if (parts.length === 3) {
    // Formato legado — pre-versionamento. Aceito na leitura.
    [ivHex, authTagHex, dataHex] = parts;
  } else {
    return null;
  }

  return {
    iv: Buffer.from(ivHex, 'hex'),
    authTag: Buffer.from(authTagHex, 'hex'),
    data: Buffer.from(dataHex, 'hex'),
  };
}

export const encryptedTransformer = {
  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${CURRENT_KEY_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  },

  from(value: string | null | undefined): string | null {
    if (value == null) return null;
    const parsed = parseCiphertext(value);
    if (parsed == null) return null;

    const decipher = createDecipheriv(ALGORITHM, getKey(), parsed.iv);
    decipher.setAuthTag(parsed.authTag);
    return (
      decipher.update(parsed.data).toString('utf8') + decipher.final('utf8')
    );
  },
};

// Use for JSONB fields stored as encrypted text (serialize before encrypting).
export const encryptedJsonTransformer = {
  to(value: object | null | undefined): string | null {
    if (value == null) return null;
    return encryptedTransformer.to(JSON.stringify(value));
  },

  from(value: string | null | undefined): object | null {
    const plain = encryptedTransformer.from(value);
    if (plain == null) return null;
    try {
      return JSON.parse(plain);
    } catch {
      return null;
    }
  },
};

// HMAC-SHA256 for searchable fields (email, phone, WhatsApp).
// Normalize before hashing so "  Test@Email.COM  " and "test@email.com" match.
export function hashField(value: string): string {
  return createHmac('sha256', getHmacSecret())
    .update(value.toLowerCase().trim())
    .digest('hex');
}
