import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

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

// Ciphertext format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
// Each segment is separated by ':' to allow single-pass parsing.
export const encryptedTransformer = {
  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  },

  from(value: string | null | undefined): string | null {
    if (value == null) return null;
    const parts = value.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return (
      decipher.update(Buffer.from(encryptedHex, 'hex')).toString('utf8') +
      decipher.final('utf8')
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
