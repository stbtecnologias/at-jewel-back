import { ApiKey } from './api-key.entity';

function makeApiKey(expiresAt: Date | null): ApiKey {
  return new ApiKey(
    'id-1',
    'n8n',
    'sk_live_abc',
    'hash',
    { scopes: ['clientes:read'] },
    true,
    null,
    'admin-1',
    new Date('2026-01-01T00:00:00Z'),
    null,
    expiresAt,
  );
}

describe('ApiKey.isExpired', () => {
  const agora = new Date('2026-06-07T12:00:00Z');

  it('chave sem expiracao (null) nunca expira', () => {
    expect(makeApiKey(null).isExpired(agora)).toBe(false);
  });

  it('chave com expiracao no futuro nao esta expirada', () => {
    const futuro = new Date('2026-06-07T13:00:00Z');
    expect(makeApiKey(futuro).isExpired(agora)).toBe(false);
  });

  it('chave com expiracao no passado esta expirada', () => {
    const passado = new Date('2026-06-07T11:00:00Z');
    expect(makeApiKey(passado).isExpired(agora)).toBe(true);
  });

  it('expiracao exatamente igual a now() conta como expirada', () => {
    expect(makeApiKey(new Date(agora)).isExpired(agora)).toBe(true);
  });
});

describe('ApiKey.toPublic', () => {
  it('inclui expiresAt e nunca expoe keyHash', () => {
    const exp = new Date('2026-12-31T00:00:00Z');
    const pub = makeApiKey(exp).toPublic();
    expect(pub.expiresAt).toEqual(exp);
    expect(pub).not.toHaveProperty('keyHash');
  });
});
