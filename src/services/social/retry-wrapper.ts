/**
 * Retry Wrapper for Social Media API Calls
 * 
 * Implements exponential backoff retry logic with rate limit handling.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatusCodes?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504], // Rate limit and server errors
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Type guard for error with status code
 */
interface ErrorWithStatusCode {
  statusCode: number;
  headers?: Record<string, string | string[]>;
}

function hasStatusCode(error: unknown): error is ErrorWithStatusCode {
  return typeof error === 'object' && error !== null && 'statusCode' in error;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any, retryableStatusCodes: number[]): boolean {
  if (hasStatusCode(error)) {
    return retryableStatusCodes.includes(error.statusCode);
  }
  
  // Network errors are retryable
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
    return true;
  }
  
  // Timeout errors are retryable
  if (error?.message?.includes('timeout') || error?.message?.includes('TIMEOUT')) {
    return true;
  }
  
  return false;
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelay;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }
      
      // Check if error is retryable
      if (!isRetryableError(error, opts.retryableStatusCodes)) {
        throw error; // Don't retry non-retryable errors
      }
      
      // Calculate delay with exponential backoff
      const retryDelay = Math.min(delay, opts.maxDelay);
      
      // For rate limit errors (429), use Retry-After header if available
      if (hasStatusCode(error) && error.statusCode === 429 && error.headers?.['retry-after']) {
        const retryAfterValue = error.headers['retry-after'];
        const retryAfter = parseInt(Array.isArray(retryAfterValue) ? retryAfterValue[0] : retryAfterValue, 10);
        if (!isNaN(retryAfter)) {
          await sleep(retryAfter * 1000);
          delay = opts.initialDelay; // Reset delay after rate limit
          continue;
        }
      }
      
      console.log(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed, retrying in ${retryDelay}ms...`);
      await sleep(retryDelay);
      delay *= opts.backoffMultiplier;
    }
  }
  
  throw lastError;
}
