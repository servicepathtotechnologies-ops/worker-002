import { decryptJson, encryptJson, maskSecrets } from '../secret-crypto';

describe('credential secret crypto', () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('encrypts and decrypts JSON credential payloads', () => {
    const payload = {
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      nested: { apiKey: 'key-789', visible: 'ok' },
    };

    const encrypted = encryptJson(payload);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('access-123');
    expect(decryptJson(encrypted)).toEqual(payload);
  });

  it('masks nested secret-shaped fields without removing public metadata', () => {
    expect(maskSecrets({
      provider: 'github',
      token: 'secret',
      nested: { clientSecret: 'secret', workspace: 'ctrlchecks' },
    })).toEqual({
      provider: 'github',
      token: '[REDACTED]',
      nested: { clientSecret: '[REDACTED]', workspace: 'ctrlchecks' },
    });
  });
});
