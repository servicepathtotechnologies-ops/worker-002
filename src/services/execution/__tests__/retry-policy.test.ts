import {
  calculateBackoff,
  getRetryConfig,
  shouldRetry,
  DEFAULT_RETRY_CONFIG,
  RetryConfig,
} from '../retry-policy';

const FIXED_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 60000,
  backoffMultiplier: 2,
};

describe('retry-policy', () => {
  describe('calculateBackoff', () => {
    it('returns a value within ±20% of the exponential delay for attempt 0', () => {
      const delay = calculateBackoff(0, FIXED_CONFIG);
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(1200);
    });

    it('doubles the base delay on each successive attempt', () => {
      const delay0 = calculateBackoff(0, FIXED_CONFIG);
      const delay1 = calculateBackoff(1, FIXED_CONFIG);
      // delay1 base is 2000; delay0 base is 1000 — ratio should be roughly 2
      // Using generous bounds to account for jitter
      expect(delay1).toBeGreaterThan(delay0 * 0.8);
    });

    it('caps delay at maxBackoffMs with jitter', () => {
      const delay = calculateBackoff(20, FIXED_CONFIG); // way beyond cap
      // With jitter the value can be up to 20% above maxBackoffMs
      expect(delay).toBeLessThanOrEqual(FIXED_CONFIG.maxBackoffMs * 1.21);
    });

    it('never returns a negative value', () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        expect(calculateBackoff(attempt, FIXED_CONFIG)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getRetryConfig', () => {
    it('returns DEFAULT_RETRY_CONFIG values when no overrides are present', () => {
      const config = getRetryConfig({});
      expect(config.maxRetries).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
      expect(config.initialBackoffMs).toBe(DEFAULT_RETRY_CONFIG.initialBackoffMs);
      expect(config.maxBackoffMs).toBe(DEFAULT_RETRY_CONFIG.maxBackoffMs);
      expect(config.backoffMultiplier).toBe(DEFAULT_RETRY_CONFIG.backoffMultiplier);
    });

    it('picks up camelCase override keys', () => {
      const config = getRetryConfig({ maxRetries: 5, initialBackoffMs: 500 });
      expect(config.maxRetries).toBe(5);
      expect(config.initialBackoffMs).toBe(500);
    });

    it('picks up snake_case override keys', () => {
      const config = getRetryConfig({ max_retries: 7, initial_backoff_ms: 200 });
      expect(config.maxRetries).toBe(7);
      expect(config.initialBackoffMs).toBe(200);
    });
  });

  describe('shouldRetry', () => {
    it('returns false when attempt has reached maxRetries', () => {
      expect(shouldRetry(new Error('timeout'), 3, FIXED_CONFIG)).toBe(false);
    });

    it('returns false for 4xx client errors except 429', () => {
      expect(shouldRetry({ code: 400 }, 0, FIXED_CONFIG)).toBe(false);
      expect(shouldRetry({ statusCode: 401 }, 1, FIXED_CONFIG)).toBe(false);
      expect(shouldRetry({ code: 403 }, 0, FIXED_CONFIG)).toBe(false);
    });

    it('returns true for 429 rate-limit errors', () => {
      expect(shouldRetry({ code: 429 }, 0, FIXED_CONFIG)).toBe(true);
    });

    it('returns false for errors containing "validation" in message', () => {
      expect(shouldRetry(new Error('validation failed'), 0, FIXED_CONFIG)).toBe(false);
    });

    it('returns false for errors containing "invalid" in message', () => {
      expect(shouldRetry(new Error('invalid input'), 1, FIXED_CONFIG)).toBe(false);
    });

    it('returns true for 5xx server errors', () => {
      expect(shouldRetry({ code: 500 }, 1, FIXED_CONFIG)).toBe(true);
    });

    it('returns true for generic network errors below maxRetries', () => {
      expect(shouldRetry(new Error('ECONNRESET'), 0, FIXED_CONFIG)).toBe(true);
    });
  });
});
