/**
 * Timeout Handler
 * 
 * Manages timeouts for operations.
 * Features:
 * - Per-operation timeouts
 * - Automatic cancellation
 * - Timeout error handling
 */

export interface TimeoutConfig {
  timeout: number; // Timeout in milliseconds
  onTimeout?: () => void; // Callback on timeout
}

/**
 * Timeout Handler
 * Manages operation timeouts
 */
export class TimeoutHandler {
  /**
   * Execute function with timeout
   */
  async execute<T>(
    fn: () => Promise<T>,
    config: TimeoutConfig
  ): Promise<T> {
    return Promise.race<T>([
      fn(),
      this.createTimeout<T>(config),
    ]);
  }

  /**
   * Create timeout promise
   */
  private createTimeout<T>(config: TimeoutConfig): Promise<T> {
    return new Promise<T>((_, reject) => {
      setTimeout(() => {
        if (config.onTimeout) {
          config.onTimeout();
        }
        reject(new Error(`Operation timed out after ${config.timeout}ms`));
      }, config.timeout);
    });
  }

  /**
   * Create timeout promise with cleanup
   */
  createTimeoutPromise<T>(
    timeout: number,
    onTimeout?: () => void
  ): { promise: Promise<T>; cancel: () => void } {
    let timeoutId: NodeJS.Timeout | null = null;
    let rejectFn: (error: Error) => void;

    const promise = new Promise<T>((_, reject) => {
      rejectFn = reject;
      timeoutId = setTimeout(() => {
        if (onTimeout) {
          onTimeout();
        }
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
    });

    const cancel = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    return { promise, cancel };
  }
}

// Export singleton instance
export const timeoutHandler = new TimeoutHandler();
