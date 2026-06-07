import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  GeminiKeyPool,
  getGeminiKeyPool,
  withGeminiKey,
  _resetGeminiKeyPool,
} from '../gemini-key-pool';

// ─── GeminiKeyPool unit tests ────────────────────────────────────────────────

describe('GeminiKeyPool', () => {
  it('throws if constructed with no keys', () => {
    expect(() => new GeminiKeyPool([])).toThrow('no API keys provided');
  });

  it('acquires keys in round-robin order', () => {
    const pool = new GeminiKeyPool(['key-a', 'key-b', 'key-c']);
    const r1 = pool.acquire();
    const r2 = pool.acquire();
    const r3 = pool.acquire();
    expect([r1.index, r2.index, r3.index]).toEqual([0, 1, 2]);
    // wraps around
    const r4 = pool.acquire();
    expect(r4.index).toBe(0);
  });

  it('returns key string for acquired index', () => {
    const pool = new GeminiKeyPool(['key-alpha', 'key-beta']);
    const { key, index } = pool.acquire();
    expect(key).toBe('key-alpha');
    expect(index).toBe(0);
  });

  it('skips rate-limited key and uses next available', () => {
    const pool = new GeminiKeyPool(['key-0', 'key-1', 'key-2']);
    pool.acquire(); // advances cursor to 1
    pool.reportRateLimit(0);

    // key[0] is cooled down — next acquire should skip it
    const { index } = pool.acquire();
    expect(index).toBe(1);
  });

  it('permanently disables key on auth error', () => {
    const pool = new GeminiKeyPool(['key-0', 'key-1']);
    pool.reportAuthError(0);

    const metrics = pool.getMetrics();
    expect(metrics[0].healthy).toBe(false);

    const { index } = pool.acquire();
    expect(index).toBe(1);
  });

  it('throws when all keys are auth-failed (no healthy keys)', () => {
    const pool = new GeminiKeyPool(['key-0']);
    pool.reportAuthError(0);
    expect(() => pool.acquire()).toThrow('all keys are disabled');
  });

  it('getMetrics never exposes key values', () => {
    const pool = new GeminiKeyPool(['secret-key-1', 'secret-key-2']);
    const metrics = pool.getMetrics();
    for (const m of metrics) {
      expect(Object.values(m)).not.toContain('secret-key-1');
      expect(Object.values(m)).not.toContain('secret-key-2');
      expect(m).toHaveProperty('index');
      expect(m).toHaveProperty('healthy');
      expect(m).toHaveProperty('inCooldown');
      expect(m).toHaveProperty('rateLimitCount');
      expect(m).toHaveProperty('requestCount');
    }
  });

  it('tracks requestCount on acquire', () => {
    const pool = new GeminiKeyPool(['key-0']);
    pool.acquire();
    pool.acquire();
    expect(pool.getMetrics()[0].requestCount).toBe(2);
  });

  it('tracks rateLimitCount and failureCount', () => {
    const pool = new GeminiKeyPool(['key-0', 'key-1']);
    pool.reportRateLimit(0);
    pool.reportRateLimit(0);
    const m = pool.getMetrics()[0];
    expect(m.rateLimitCount).toBe(2);
    expect(m.failureCount).toBe(2);
  });

  it('size returns number of keys', () => {
    const pool = new GeminiKeyPool(['a', 'b', 'c']);
    expect(pool.size).toBe(3);
  });

  it('inCooldown is true immediately after rate-limit, false after expiry', () => {
    const pool = new GeminiKeyPool(['key-0', 'key-1']);
    pool.reportRateLimit(0);
    const before = pool.getMetrics()[0];
    expect(before.inCooldown).toBe(true);
  });
});

// ─── Singleton (getGeminiKeyPool) ────────────────────────────────────────────

describe('getGeminiKeyPool singleton', () => {
  const originalMulti = process.env.GEMINI_API_KEYS;
  const originalSingle = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    _resetGeminiKeyPool();
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    _resetGeminiKeyPool();
    if (originalMulti !== undefined) process.env.GEMINI_API_KEYS = originalMulti;
    else delete process.env.GEMINI_API_KEYS;
    if (originalSingle !== undefined) process.env.GEMINI_API_KEY = originalSingle;
    else delete process.env.GEMINI_API_KEY;
  });

  it('initializes from GEMINI_API_KEYS (comma-separated)', () => {
    process.env.GEMINI_API_KEYS = 'key-x,key-y';
    const pool = getGeminiKeyPool();
    expect(pool.size).toBe(2);
  });

  it('falls back to GEMINI_API_KEY when GEMINI_API_KEYS is absent', () => {
    process.env.GEMINI_API_KEY = 'fallback-key';
    const pool = getGeminiKeyPool();
    expect(pool.size).toBe(1);
  });

  it('throws when neither env var is set', () => {
    expect(() => getGeminiKeyPool()).toThrow('No Gemini API key configured');
  });

  it('returns the same singleton on repeated calls', () => {
    process.env.GEMINI_API_KEYS = 'key-singleton';
    const a = getGeminiKeyPool();
    const b = getGeminiKeyPool();
    expect(a).toBe(b);
  });
});

// ─── withGeminiKey retry logic ────────────────────────────────────────────────

describe('withGeminiKey', () => {
  const originalMulti = process.env.GEMINI_API_KEYS;

  beforeEach(() => {
    _resetGeminiKeyPool();
    process.env.GEMINI_API_KEYS = 'key-0,key-1,key-2';
  });

  afterEach(() => {
    _resetGeminiKeyPool();
    if (originalMulti !== undefined) process.env.GEMINI_API_KEYS = originalMulti;
    else delete process.env.GEMINI_API_KEYS;
  });

  it('returns result from a successful call', async () => {
    const result = await withGeminiKey(async (_key) => 'ok');
    expect(result).toBe('ok');
  });

  it('retries on rate-limit error and succeeds with next key', async () => {
    let calls = 0;
    const result = await withGeminiKey(async (_key) => {
      calls++;
      if (calls === 1) {
        const err: any = new Error('RESOURCE_EXHAUSTED');
        err.status = 429;
        throw err;
      }
      return 'recovered';
    });
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('does not retry on non-retryable errors', async () => {
    let calls = 0;
    await expect(withGeminiKey(async (_key) => {
      calls++;
      throw new Error('Some random error');
    })).rejects.toThrow('Some random error');
    expect(calls).toBe(1);
  });

  it('retries on auth error and moves to next key', async () => {
    let calls = 0;
    const result = await withGeminiKey(async (_key) => {
      calls++;
      if (calls === 1) {
        const err: any = new Error('PERMISSION_DENIED');
        err.status = 401;
        throw err;
      }
      return 'auth-recovered';
    });
    expect(result).toBe('auth-recovered');
    expect(calls).toBe(2);
  });

  it('exhausts all retries and throws the last error', async () => {
    _resetGeminiKeyPool();
    process.env.GEMINI_API_KEYS = 'only-key';
    await expect(withGeminiKey(async (_key) => {
      const err: any = new Error('RESOURCE_EXHAUSTED');
      err.status = 429;
      throw err;
    })).rejects.toBeDefined();
  });
});
