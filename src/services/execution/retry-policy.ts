/**
 * Retry Policy for Node Execution
 * 
 * Implements exponential backoff retry logic per node
 */

export interface RetryConfig {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1000, // 1 second
  maxBackoffMs: 60000, // 60 seconds
  backoffMultiplier: 2, // Double each retry
};

/**
 * Calculate backoff delay for retry attempt
 * Uses exponential backoff with jitter
 */
export function calculateBackoff(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = Math.min(
    config.initialBackoffMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxBackoffMs
  );

  // Add jitter (±20%) to prevent thundering herd
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  const delay = Math.max(0, exponentialDelay + jitter);

  return Math.round(delay);
}

/**
 * Get retry config from node config or use defaults
 */
export function getRetryConfig(nodeConfig: Record<string, any>): RetryConfig {
  return {
    maxRetries: nodeConfig.maxRetries ?? nodeConfig.max_retries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    initialBackoffMs: nodeConfig.initialBackoffMs ?? nodeConfig.initial_backoff_ms ?? DEFAULT_RETRY_CONFIG.initialBackoffMs,
    maxBackoffMs: nodeConfig.maxBackoffMs ?? nodeConfig.max_backoff_ms ?? DEFAULT_RETRY_CONFIG.maxBackoffMs,
    backoffMultiplier: nodeConfig.backoffMultiplier ?? nodeConfig.backoff_multiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
  };
}

/**
 * Check if node should retry based on error
 */
export function shouldRetry(error: any, attempt: number, config: RetryConfig): boolean {
  if (attempt >= config.maxRetries) {
    return false;
  }

  // Don't retry on certain error types
  const errorMessage = error?.message || String(error);
  const errorCode = error?.code || error?.statusCode;

  // Don't retry on client errors (4xx) except 429 (rate limit)
  if (errorCode >= 400 && errorCode < 500 && errorCode !== 429) {
    return false;
  }

  // Don't retry on validation errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return false;
  }

  // Retry on network errors, timeouts, rate limits, server errors
  return true;
}
