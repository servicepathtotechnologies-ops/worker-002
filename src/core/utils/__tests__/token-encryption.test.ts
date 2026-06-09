import {
  encryptToken,
  decryptToken,
  isEncrypted,
  encryptTokens,
  decryptTokens,
} from '../token-encryption';

jest.mock('../../config', () => ({
  config: { encryptionKey: 'test-encryption-key-day82-unit-tests' },
}));

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-day82-unit-tests';
});

afterAll(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe('encryptToken', () => {
  it('returns three colon-separated hex parts', () => {
    const result = encryptToken('my-secret-token');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach(part => expect(part).toMatch(/^[0-9a-f]+$/i));
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const a = encryptToken('same-token');
    const b = encryptToken('same-token');
    expect(a).not.toBe(b);
  });

  it('throws on empty string', () => {
    expect(() => encryptToken('')).toThrow('plaintext must be a non-empty string');
  });

  it('throws on non-string input', () => {
    expect(() => encryptToken(null as unknown as string)).toThrow(
      'plaintext must be a non-empty string'
    );
  });
});

describe('decryptToken', () => {
  it('round-trips correctly: decrypt(encrypt(x)) === x', () => {
    const original = 'oauth-access-token-abc123';
    expect(decryptToken(encryptToken(original))).toBe(original);
  });

  it('round-trips unicode / special characters', () => {
    const original = 'token with spaces & special chars: !@#$%^&*()';
    expect(decryptToken(encryptToken(original))).toBe(original);
  });

  it('returns the raw string unchanged when it is not in encrypted format (compat path)', () => {
    const plaintext = 'unencrypted-legacy-token';
    expect(decryptToken(plaintext)).toBe(plaintext);
  });

  it('returns a 2-part colon string unchanged (not 3 parts)', () => {
    const twoPartToken = 'aabbccdd:eeff1122';
    expect(decryptToken(twoPartToken)).toBe(twoPartToken);
  });

  it('throws on empty string', () => {
    expect(() => decryptToken('')).toThrow(
      'encrypted token must be a non-empty string'
    );
  });

  it('throws on non-string input', () => {
    expect(() => decryptToken(undefined as unknown as string)).toThrow(
      'encrypted token must be a non-empty string'
    );
  });
});

describe('isEncrypted', () => {
  it('returns true for a freshly encrypted token', () => {
    expect(isEncrypted(encryptToken('check-me'))).toBe(true);
  });

  it('returns false for a plain text string', () => {
    expect(isEncrypted('plain-text-token')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isEncrypted('')).toBe(false);
  });

  it('returns false for a 2-part hex value', () => {
    expect(isEncrypted('aabbccdd:eeff1122')).toBe(false);
  });

  it('returns false for 3 parts that contain non-hex characters', () => {
    expect(isEncrypted('zzzz:yyyy:xxxx')).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    expect(isEncrypted(null as unknown as string)).toBe(false);
  });
});

describe('encryptTokens', () => {
  it('encrypts both access_token and refresh_token', () => {
    const result = encryptTokens({ access_token: 'acc', refresh_token: 'ref' });
    expect(isEncrypted(result.access_token)).toBe(true);
    expect(isEncrypted(result.refresh_token as string)).toBe(true);
  });

  it('null refresh_token stays null', () => {
    const result = encryptTokens({ access_token: 'acc', refresh_token: null });
    expect(isEncrypted(result.access_token)).toBe(true);
    expect(result.refresh_token).toBeNull();
  });

  it('undefined refresh_token maps to null', () => {
    const result = encryptTokens({ access_token: 'acc' });
    expect(result.refresh_token).toBeNull();
  });
});

describe('decryptTokens', () => {
  it('round-trips both tokens', () => {
    const encrypted = encryptTokens({ access_token: 'acc-orig', refresh_token: 'ref-orig' });
    const decrypted = decryptTokens(encrypted);
    expect(decrypted.access_token).toBe('acc-orig');
    expect(decrypted.refresh_token).toBe('ref-orig');
  });

  it('null refresh_token stays null', () => {
    const encrypted = encryptTokens({ access_token: 'acc-only', refresh_token: null });
    const decrypted = decryptTokens(encrypted);
    expect(decrypted.access_token).toBe('acc-only');
    expect(decrypted.refresh_token).toBeNull();
  });
});
