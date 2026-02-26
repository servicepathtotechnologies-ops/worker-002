/**
 * Retry Manager
 * 
 * Manages retries with exponential backoff.
 * Features:
 * - Exponential backoff
 * - Configurable max retries
 * - Jitter to prevent thundering herd
 * - Retry strategies (exponential, linear, fixed)
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number; // Initial delay in ms
  maxDelay: number; // Maximum delay in ms
  multiplier: number; // Exponential multiplier
  jitter: boolean; // Add random jitter
  strategy: 'exponential' | 'linear' | 'fixed';
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

/**
 * Retry Manager
 * Handles retries with exponential backoff
 */
export class RetryManager {
  /**
   * Execute function with retry
   */
  async execute<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const retryConfig: RetryConfig = {
      maxRetries: config.maxRetries || 3,
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 60000,
      multiplier: config.multiplier || 2,
      jitter: config.jitter !== false,
      strategy: config.strategy || 'exponential',
    };

    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      attempts = attempt + 1;

      try {
        const result = await fn();
        return {
          success: true,
          result,
          attempts,
          totalTime: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on last attempt
        if (attempt >= retryConfig.maxRetries) {
          break;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt, retryConfig);
        
        console.log(`[RetryManager] ⚠️  Attempt ${attempts} failed, retrying in ${delay}ms: ${lastError.message}`);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalTime: Date.now() - startTime,
    };
  }

  /**
   * Calculate delay based on strategy
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay: number;

    switch (config.strategy) {
      case 'exponential':
        delay = config.initialDelay * Math.pow(config.multiplier, attempt);
        break;
      case 'linear':
        delay = config.initialDelay * (attempt + 1);
        break;
      case 'fixed':
        delay = config.initialDelay;
        break;
      default:
        delay = config.initialDelay * Math.pow(config.multiplier, attempt);
    }

    // Cap at max delay
    delay = Math.min(delay, config.maxDelay);

    // Add jitter if enabled
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      const jitter = (Math.random() * 2 - 1) * jitterAmount;
      delay = Math.max(0, delay + jitter);
    }

    return Math.floor(delay);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const retryManager = new RetryManager();
