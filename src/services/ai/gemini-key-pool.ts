/**
 * Gemini API Key Pool
 *
 * Supports multiple Gemini API keys (GEMINI_API_KEYS=key1,key2,...) with:
 * - Round-robin + cooldown selection
 * - Rate-limit detection and temporary backoff
 * - Auth-error permanent disabling
 * - Backward compat with single GEMINI_API_KEY
 *
 * Key indices are logged, never key values.
 */

const DEFAULT_COOLDOWN_MS = parseInt(process.env.GEMINI_KEY_COOLDOWN_SECONDS || '60', 10) * 1000;
const MAX_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES || '2', 10);

interface KeyState {
  index: number;
  cooldownUntil: number;   // epoch ms; 0 = available
  healthy: boolean;         // false = permanent auth failure
  rateLimitCount: number;
  requestCount: number;
  failureCount: number;
}

class GeminiKeyPool {
  private keys: string[];
  private states: KeyState[];
  private cursor = 0;

  constructor(keys: string[]) {
    if (keys.length === 0) throw new Error('GeminiKeyPool: no API keys provided');
    this.keys = keys;
    this.states = keys.map((_, i) => ({
      index: i,
      cooldownUntil: 0,
      healthy: true,
      rateLimitCount: 0,
      requestCount: 0,
      failureCount: 0,
    }));
  }

  /** Pick the next available key index using round-robin, skipping cooled-down and unhealthy ones. */
  private nextAvailableIndex(): number | null {
    const now = Date.now();
    const n = this.keys.length;
    for (let attempt = 0; attempt < n; attempt++) {
      const i = (this.cursor + attempt) % n;
      const s = this.states[i];
      if (s.healthy && now >= s.cooldownUntil) {
        this.cursor = (i + 1) % n;
        return i;
      }
    }
    // All keys are in cooldown — pick the one with the soonest recovery
    let soonest = -1;
    let soonestTime = Infinity;
    for (let i = 0; i < n; i++) {
      if (this.states[i].healthy && this.states[i].cooldownUntil < soonestTime) {
        soonestTime = this.states[i].cooldownUntil;
        soonest = i;
      }
    }
    return soonest >= 0 ? soonest : null;
  }

  /** Get the API key string for a given index. */
  getKey(index: number): string {
    return this.keys[index];
  }

  /** Choose a key for the next request. Returns { key, index } or throws. */
  acquire(): { key: string; index: number } {
    const i = this.nextAvailableIndex();
    if (i === null) throw new Error('GeminiKeyPool: all keys are disabled (auth failures)');
    this.states[i].requestCount++;
    return { key: this.keys[i], index: i };
  }

  /** Report a successful request for key at given index. */
  reportSuccess(index: number): void {
    // No state change needed beyond counting
  }

  /** Report a rate-limit error (429 / RESOURCE_EXHAUSTED). Key enters cooldown. */
  reportRateLimit(index: number): void {
    const s = this.states[index];
    s.rateLimitCount++;
    s.failureCount++;
    s.cooldownUntil = Date.now() + DEFAULT_COOLDOWN_MS;
    console.warn(`[GeminiKeyPool] Key[${index}] rate-limited — cooling down for ${DEFAULT_COOLDOWN_MS / 1000}s`);
  }

  /** Report an auth error (401 / PERMISSION_DENIED). Key is permanently disabled. */
  reportAuthError(index: number): void {
    const s = this.states[index];
    s.healthy = false;
    s.failureCount++;
    console.error(`[GeminiKeyPool] Key[${index}] auth error — permanently disabled`);
  }

  /** Report any other transient error. Does not affect key health. */
  reportTransientError(index: number): void {
    this.states[index].failureCount++;
  }

  /** Safe metrics (no secrets). */
  getMetrics(): Array<{ index: number; healthy: boolean; inCooldown: boolean; rateLimitCount: number; requestCount: number; failureCount: number }> {
    const now = Date.now();
    return this.states.map(s => ({
      index: s.index,
      healthy: s.healthy,
      inCooldown: s.healthy && now < s.cooldownUntil,
      rateLimitCount: s.rateLimitCount,
      requestCount: s.requestCount,
      failureCount: s.failureCount,
    }));
  }

  get size(): number {
    return this.keys.length;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _pool: GeminiKeyPool | null = null;

function buildPool(): GeminiKeyPool {
  const multi = process.env.GEMINI_API_KEYS;
  const single = process.env.GEMINI_API_KEY;

  let keys: string[];
  if (multi && multi.trim()) {
    keys = multi.split(',').map(k => k.trim()).filter(Boolean);
  } else if (single && single.trim()) {
    keys = [single.trim()];
  } else {
    throw new Error('No Gemini API key configured. Set GEMINI_API_KEYS or GEMINI_API_KEY.');
  }

  console.log(`[GeminiKeyPool] Initialized with ${keys.length} key(s)`);
  return new GeminiKeyPool(keys);
}

export function getGeminiKeyPool(): GeminiKeyPool {
  if (!_pool) _pool = buildPool();
  return _pool;
}

/** Reset pool (test use only). */
export function _resetGeminiKeyPool(): void {
  _pool = null;
}

export { GeminiKeyPool, MAX_RETRIES };

// ─── Helper: call fn with key-pool retry logic ────────────────────────────────

/**
 * Execute `fn` with an automatically selected Gemini API key.
 * On rate-limit (429) or RESOURCE_EXHAUSTED, marks the key as cooling down
 * and retries with the next available key, up to MAX_RETRIES times.
 * On auth error (401 / PERMISSION_DENIED), marks key as permanently unhealthy.
 * User/input errors (4xx that are not 429/401) are NOT retried.
 */
export async function withGeminiKey<T>(
  fn: (apiKey: string) => Promise<T>
): Promise<T> {
  const pool = getGeminiKeyPool();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { key, index } = pool.acquire();
    try {
      const result = await fn(key);
      pool.reportSuccess(index);
      return result;
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode ?? err?.code ?? 0;
      const message: string = err?.message ?? String(err);
      const isRateLimit =
        status === 429 ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('quota') ||
        message.includes('rate limit');
      const isAuth =
        status === 401 ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('API_KEY_INVALID') ||
        message.includes('invalid API key');

      if (isRateLimit) {
        pool.reportRateLimit(index);
        console.warn(`[GeminiKeyPool] Key[${index}] rate-limited on attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
        lastError = err;
        // Continue to next attempt (next key will be selected by pool)
      } else if (isAuth) {
        pool.reportAuthError(index);
        console.error(`[GeminiKeyPool] Key[${index}] auth failure on attempt ${attempt + 1}`);
        lastError = err;
        // Continue to next attempt
      } else {
        // Non-retryable error — propagate immediately
        pool.reportTransientError(index);
        throw err;
      }
    }
  }

  throw lastError ?? new Error('GeminiKeyPool: all retry attempts failed');
}
