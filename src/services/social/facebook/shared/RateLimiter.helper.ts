const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

const defaultConfig: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 500,
  maxDelayMs: 15_000,
};

export function isRateLimited(errorCode?: number, statusCode?: number): boolean {
  return statusCode === 429 || errorCode === 4 || errorCode === 17;
}

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const merged: RetryConfig = { ...defaultConfig, ...config };
  let attempt = 0;
  let delay = merged.initialDelayMs;

  while (attempt < merged.maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (error: any) {
      const errorCode = error?.response?.data?.error?.code as number | undefined;
      const statusCode = error?.response?.status as number | undefined;
      if (!isRateLimited(errorCode, statusCode) || attempt >= merged.maxAttempts) {
        throw error;
      }
      await sleep(delay);
      delay = Math.min(merged.maxDelayMs, delay * 2);
    }
  }

  throw new Error('Rate limit retry exhausted');
}
