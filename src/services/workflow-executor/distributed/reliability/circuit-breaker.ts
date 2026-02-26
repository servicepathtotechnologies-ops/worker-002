/**
 * Circuit Breaker
 * 
 * Prevents cascading failures by opening circuit when provider fails repeatedly.
 * Features:
 * - Per-provider circuit breakers
 * - Configurable failure thresholds
 * - Automatic recovery
 * - Half-open state for testing
 */

export interface CircuitBreakerConfig {
  failureThreshold: number; // Open circuit after N failures
  successThreshold: number; // Close circuit after N successes (half-open state)
  timeout: number; // Time to wait before attempting half-open (ms)
  resetTimeout: number; // Time to wait before resetting failure count (ms)
}

export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Circuit open, reject requests
  HALF_OPEN = 'half_open', // Testing if provider recovered
}

export interface CircuitBreakerStats {
  provider: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
  totalFailures: number;
}

/**
 * Circuit Breaker
 * Manages circuit state per provider
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private totalRequests = 0;
  private totalFailures = 0;
  private config: CircuitBreakerConfig;

  constructor(
    private provider: string,
    config?: Partial<CircuitBreakerConfig>
  ) {
    this.config = {
      failureThreshold: config?.failureThreshold || 5,
      successThreshold: config?.successThreshold || 2,
      timeout: config?.timeout || 60000, // 1 minute
      resetTimeout: config?.resetTimeout || 300000, // 5 minutes
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
      
      if (timeSinceLastFailure >= this.config.timeout) {
        // Try half-open state
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        console.log(`[CircuitBreaker] ${this.provider}: Moving to HALF_OPEN state`);
      } else {
        // Circuit still open
        throw new Error(`Circuit breaker OPEN for provider ${this.provider}. Retry after ${Math.ceil((this.config.timeout - timeSinceLastFailure) / 1000)}s`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.config.successThreshold) {
        // Circuit recovered
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        console.log(`[CircuitBreaker] ${this.provider}: Circuit CLOSED (recovered)`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success (if enough time passed)
      const timeSinceLastFailure = this.lastFailureTime 
        ? Date.now() - this.lastFailureTime 
        : Infinity;
      
      if (timeSinceLastFailure >= this.config.resetTimeout) {
        this.failures = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failures++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during half-open, open circuit again
      this.state = CircuitState.OPEN;
      this.successes = 0;
      console.log(`[CircuitBreaker] ${this.provider}: Circuit OPEN (failed in half-open)`);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.config.failureThreshold) {
        // Open circuit
        this.state = CircuitState.OPEN;
        console.log(`[CircuitBreaker] ${this.provider}: Circuit OPEN (${this.failures} failures)`);
      }
    }
  }

  /**
   * Get circuit breaker stats
   */
  getStats(): CircuitBreakerStats {
    return {
      provider: this.provider,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    console.log(`[CircuitBreaker] ${this.provider}: Circuit manually reset`);
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }
}

/**
 * Circuit Breaker Manager
 * Manages circuit breakers for all providers
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker for provider
   */
  getBreaker(provider: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(provider)) {
      this.breakers.set(provider, new CircuitBreaker(provider, config));
    }
    return this.breakers.get(provider)!;
  }

  /**
   * Execute with circuit breaker protection
   */
  async execute<T>(
    provider: string,
    fn: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const breaker = this.getBreaker(provider, config);
    return breaker.execute(fn);
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.values()).map(b => b.getStats());
  }

  /**
   * Reset circuit breaker for provider
   */
  reset(provider: string): void {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Export singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
