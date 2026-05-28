import { randomBytes } from 'crypto';
import {
  encryptedJsonTransformer,
  encryptedTransformer,
  hashField,
} from './encrypted-column.transformer';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function setEncryptionKey() {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
}

function setHashSecret() {
  process.env.HASH_SECRET = randomBytes(32).toString('hex');
}

describe('encryptedTransformer', () => {
  beforeEach(() => {
    resetEnv();
    setEncryptionKey();
    setHashSecret();
  });

  afterAll(() => {
    resetEnv();
  });

  describe('round-trip', () => {
    it('deve cifrar e decifrar mantendo o valor original', () => {
      const plain = '(85) 9 8888-7777';
      const cipher = encryptedTransformer.to(plain);
      expect(cipher).not.toBe(plain);
      expect(encryptedTransformer.from(cipher)).toBe(plain);
    });

    it('deve lidar com strings vazias', () => {
      const cipher = encryptedTransformer.to('');
      expect(encryptedTransformer.from(cipher)).toBe('');
    });

    it('deve lidar com strings unicode (emoji + acentos)', () => {
      const plain = 'Anastasia — clientes VIP 💎 com R$10.000+';
      const cipher = encryptedTransformer.to(plain);
      expect(encryptedTransformer.from(cipher)).toBe(plain);
    });

    it('deve lidar com strings longas (10k chars)', () => {
      const plain = 'a'.repeat(10_000);
      const cipher = encryptedTransformer.to(plain);
      expect(encryptedTransformer.from(cipher)).toBe(plain);
    });
  });

  describe('formato e versionamento', () => {
    it('deve sempre escrever com prefixo de versao v1:', () => {
      const cipher = encryptedTransformer.to('teste');
      expect(cipher).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('deve produzir 4 segmentos separados por dois pontos', () => {
      const cipher = encryptedTransformer.to('teste');
      expect(cipher!.split(':')).toHaveLength(4);
    });

    it('deve ler formato legado (3 segmentos sem prefixo de versao)', () => {
      // Simula dado escrito pela versao anterior do transformer.
      // Para gerar um formato legado real precisamos cifrar e remover o prefixo.
      const cifradoV1 = encryptedTransformer.to('hello legacy')!;
      const legacy = cifradoV1.replace(/^v1:/, ''); // remove prefixo
      expect(encryptedTransformer.from(legacy)).toBe('hello legacy');
    });

    it('deve retornar null para formato invalido', () => {
      expect(encryptedTransformer.from('formato:errado')).toBeNull();
      expect(encryptedTransformer.from('texto livre sem dois pontos')).toBeNull();
    });
  });

  describe('IV unico (semantic security)', () => {
    it('mesmo plaintext deve gerar ciphertexts diferentes', () => {
      const plain = 'valor identico';
      const a = encryptedTransformer.to(plain);
      const b = encryptedTransformer.to(plain);
      expect(a).not.toBe(b);
      // Mas ambos decifram para o mesmo valor original.
      expect(encryptedTransformer.from(a)).toBe(plain);
      expect(encryptedTransformer.from(b)).toBe(plain);
    });

    it('deve produzir IVs distribuidos (smoke test com 50 cifragens)', () => {
      const ivs = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const cipher = encryptedTransformer.to('mesmo plaintext')!;
        const iv = cipher.split(':')[1]; // segundo segmento (apos v1:)
        ivs.add(iv);
      }
      expect(ivs.size).toBe(50); // todos unicos
    });
  });

  describe('null e undefined', () => {
    it('deve retornar null ao cifrar null', () => {
      expect(encryptedTransformer.to(null)).toBeNull();
    });

    it('deve retornar null ao cifrar undefined', () => {
      expect(encryptedTransformer.to(undefined)).toBeNull();
    });

    it('deve retornar null ao decifrar null', () => {
      expect(encryptedTransformer.from(null)).toBeNull();
    });

    it('deve retornar null ao decifrar undefined', () => {
      expect(encryptedTransformer.from(undefined)).toBeNull();
    });
  });

  describe('integridade (auth tag)', () => {
    it('deve falhar ao decifrar ciphertext adulterado (auth tag detecta)', () => {
      const cipher = encryptedTransformer.to('valor protegido')!;
      // Adultera o ultimo byte do ciphertext (segmento 4 = ultimo).
      const parts = cipher.split(':');
      const lastByte = parts[3].slice(-2);
      const flipped = parts[3].slice(0, -2) + (lastByte === '00' ? '01' : '00');
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${flipped}`;
      expect(() => encryptedTransformer.from(tampered)).toThrow();
    });
  });

  describe('falha sem env', () => {
    it('deve lancar erro se ENCRYPTION_KEY ausente', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encryptedTransformer.to('x')).toThrow(/ENCRYPTION_KEY/);
    });

    it('deve lancar erro se ENCRYPTION_KEY com tamanho errado', () => {
      process.env.ENCRYPTION_KEY = 'short';
      expect(() => encryptedTransformer.to('x')).toThrow(/64-char hex/);
    });
  });
});

describe('encryptedJsonTransformer', () => {
  beforeEach(() => {
    resetEnv();
    setEncryptionKey();
    setHashSecret();
  });

  afterAll(() => {
    resetEnv();
  });

  it('deve cifrar e decifrar objeto preservando estrutura', () => {
    const obj = {
      itens: ['anel ouro 18k', 'colar perola'],
      ticket: 5000,
      tags: ['vip', 'natal'],
    };
    const cipher = encryptedJsonTransformer.to(obj);
    expect(encryptedJsonTransformer.from(cipher)).toEqual(obj);
  });

  it('deve lidar com objeto null', () => {
    expect(encryptedJsonTransformer.to(null)).toBeNull();
    expect(encryptedJsonTransformer.from(null)).toBeNull();
  });

  it('deve retornar null se o JSON cifrado nao for parseavel', () => {
    // Cifra texto que nao e JSON valido usando o transformer base.
    const cipher = encryptedTransformer.to('isso nao e json');
    expect(encryptedJsonTransformer.from(cipher)).toBeNull();
  });
});

describe('hashField', () => {
  beforeEach(() => {
    resetEnv();
    setHashSecret();
  });

  afterAll(() => {
    resetEnv();
  });

  it('deve produzir hash deterministico para o mesmo input', () => {
    const a = hashField('test@email.com');
    const b = hashField('test@email.com');
    expect(a).toBe(b);
  });

  it('deve produzir hashes diferentes para inputs diferentes', () => {
    const a = hashField('test@email.com');
    const b = hashField('outro@email.com');
    expect(a).not.toBe(b);
  });

  it('deve produzir SHA-256 (64 chars hex)', () => {
    const h = hashField('qualquer-coisa');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deve normalizar lowercase', () => {
    expect(hashField('Test@Email.COM')).toBe(hashField('test@email.com'));
  });

  it('deve normalizar trim', () => {
    expect(hashField('  test@email.com  ')).toBe(hashField('test@email.com'));
  });

  it('deve combinar trim + lowercase', () => {
    expect(hashField('  Test@EMAIL.com  ')).toBe(hashField('test@email.com'));
  });

  it('deve lancar erro se HASH_SECRET ausente', () => {
    delete process.env.HASH_SECRET;
    expect(() => hashField('x')).toThrow(/HASH_SECRET/);
  });

  it('hashes com chaves diferentes nao devem colidir', () => {
    process.env.HASH_SECRET = 'chave-a';
    const a = hashField('test@email.com');
    process.env.HASH_SECRET = 'chave-b';
    const b = hashField('test@email.com');
    expect(a).not.toBe(b);
  });
});
