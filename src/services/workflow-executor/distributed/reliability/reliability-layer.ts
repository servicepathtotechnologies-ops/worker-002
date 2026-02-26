/**
 * Reliability Layer
 * 
 * Comprehensive reliability layer for distributed workflow execution.
 * Integrates:
 * - Circuit breaker per provider
 * - Rate limit protection
 * - Retry with exponential backoff
 * - Timeout handling
 * - Dead letter queue
 * - Idempotent workflow execution
 */

import { CircuitBreakerManager, circuitBreakerManager } from './circuit-breaker';
import { RateLimitManager, rateLimitManager } from './rate-limiter';
import { RetryManager, retryManager } from './retry-manager';
import { TimeoutHandler, timeoutHandler } from './timeout-handler';
import { DeadLetterQueue, getDeadLetterQueue } from './dead-letter-queue';
import { IdempotencyManager, idempotencyManager } from './idempotency-manager';
import { QueueJob } from '../redis-queue-manager';

export interface ReliabilityConfig {
  circuitBreaker?: {
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
  };
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
    burst?: number;
  };
  retry?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    multiplier?: number;
    jitter?: boolean;
    strategy?: 'exponential' | 'linear' | 'fixed';
  };
  timeout?: {
    timeout: number;
  };
  idempotency?: {
    enabled: boolean;
    ttl?: number; // Time to live in ms
  };
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  nodeId: string;
  nodeType: string;
  provider?: string;
  input: any;
  idempotencyKey?: string;
}

export interface ExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  fromCache?: boolean;
  attempts?: number;
  executionTime?: number;
}

/**
 * Reliability Layer
 * Orchestrates all reliability features
 */
export class ReliabilityLayer {
  private circuitBreakerManager: CircuitBreakerManager;
  private rateLimitManager: RateLimitManager;
  private retryManager: RetryManager;
  private timeoutHandler: TimeoutHandler;
  private deadLetterQueue: DeadLetterQueue;
  private idempotencyManager: IdempotencyManager;
  private isInitialized = false;

  constructor() {
    this.circuitBreakerManager = circuitBreakerManager;
    this.rateLimitManager = rateLimitManager;
    this.retryManager = retryManager;
    this.timeoutHandler = timeoutHandler;
    this.deadLetterQueue = getDeadLetterQueue();
    this.idempotencyManager = idempotencyManager;
  }

  /**
   * Initialize reliability layer
   */
  async initialize(redisUrl?: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.rateLimitManager.initialize(redisUrl);
    await this.deadLetterQueue.initialize(redisUrl);
    await this.idempotencyManager.initialize(redisUrl);

    this.isInitialized = true;
    console.log('[ReliabilityLayer] ✅ Reliability layer initialized');
  }

  /**
   * Configure provider
   */
  configureProvider(provider: string, config: ReliabilityConfig): void {
    // Configure rate limit
    if (config.rateLimit) {
      this.rateLimitManager.configure(provider, config.rateLimit);
    }

    // Circuit breaker is configured per-execution, not globally
    // But we can set defaults here if needed
  }

  /**
   * Execute with full reliability protection
   */
  async execute<T>(
    context: ExecutionContext,
    fn: () => Promise<T>,
    config: ReliabilityConfig = {}
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    const provider = context.provider || this.extractProvider(context.nodeType);

    // STEP 1: Check idempotency
    if (config.idempotency?.enabled && context.idempotencyKey) {
      const idempotencyCheck = await this.idempotencyManager.checkIdempotency(
        context.idempotencyKey,
        context.executionId,
        context.workflowId,
        context.input
      );

      if (idempotencyCheck.isDuplicate && idempotencyCheck.cachedResult) {
        console.log(`[ReliabilityLayer] ✅ Idempotent execution detected, returning cached result`);
        return {
          success: true,
          result: idempotencyCheck.cachedResult as T,
          fromCache: true,
          executionTime: Date.now() - startTime,
        };
      }
    }

    // STEP 2: Check rate limit
    if (provider) {
      try {
        await this.rateLimitManager.waitForLimit(provider);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[ReliabilityLayer] ❌ Rate limit error for ${provider}: ${errorMsg}`);
        await this.handleFailure(context, new Error(`Rate limit exceeded: ${errorMsg}`), 'rate_limit');
        return {
          success: false,
          error: new Error(`Rate limit exceeded: ${errorMsg}`),
          executionTime: Date.now() - startTime,
        };
      }
    }

    // STEP 3: Execute with circuit breaker, retry, and timeout
    try {
      const result = await this.executeWithProtection(
        provider,
        fn,
        config
      );

      // STEP 4: Store result for idempotency
      if (config.idempotency?.enabled && context.idempotencyKey) {
        await this.idempotencyManager.storeResult(
          context.idempotencyKey,
          context.executionId,
          context.workflowId,
          context.input,
          result
        );
      }

      return {
        success: true,
        result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const executionError = error instanceof Error ? error : new Error(String(error));
      await this.handleFailure(context, executionError, 'unknown');
      return {
        success: false,
        error: executionError,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute with circuit breaker, retry, and timeout protection
   */
  private async executeWithProtection<T>(
    provider: string | undefined,
    fn: () => Promise<T>,
    config: ReliabilityConfig
  ): Promise<T> {
    // Wrap with timeout if configured
    const executeFn = config.timeout
      ? () => this.timeoutHandler.execute(fn, config.timeout!)
      : fn;

    // Wrap with retry if configured
    if (config.retry) {
      const retryResult = await this.retryManager.execute(executeFn, config.retry);
      
      if (!retryResult.success) {
        throw retryResult.error || new Error('Retry failed');
      }

      return retryResult.result!;
    }

    // Wrap with circuit breaker if provider specified
    if (provider) {
      return this.circuitBreakerManager.execute(
        provider,
        executeFn,
        config.circuitBreaker
      );
    }

    // Execute without circuit breaker
    return executeFn();
  }

  /**
   * Handle execution failure
   */
  private async handleFailure(
    context: ExecutionContext,
    error: Error,
    reason: 'max_retries' | 'circuit_open' | 'timeout' | 'rate_limit' | 'unknown'
  ): Promise<void> {
    console.error(`[ReliabilityLayer] ❌ Execution failed: ${context.executionId}/${context.nodeId} - ${error.message}`);

    // Create job for dead letter queue
    const job: QueueJob = {
      id: `${context.executionId}-${context.nodeId}`,
      workflowId: context.workflowId,
      executionId: context.executionId,
      nodeId: context.nodeId,
      nodeType: context.nodeType,
      input: context.input,
      priority: 0,
      maxRetries: 0,
      retryCount: 0,
      retryDelay: 0,
      createdAt: Date.now(),
      status: 'failed',
      error: error.message,
    };

    // Add to dead letter queue
    try {
      await this.deadLetterQueue.addJob(job, error, reason);
    } catch (dlqError) {
      console.error(`[ReliabilityLayer] ❌ Failed to add job to DLQ:`, dlqError);
    }
  }

  /**
   * Extract provider from node type
   */
  private extractProvider(nodeType: string): string | undefined {
    // Extract provider from node type (e.g., 'google_sheets' -> 'google')
    const providerMap: Record<string, string> = {
      'google_sheets': 'google',
      'google_gmail': 'google',
      'google_calendar': 'google',
      'slack_message': 'slack',
      'ollama': 'ollama',
      'openai_gpt': 'openai',
      'anthropic_claude': 'anthropic',
      'hubspot': 'hubspot',
      'airtable': 'airtable',
    };

    for (const [node, provider] of Object.entries(providerMap)) {
      if (nodeType.includes(node)) {
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitBreakerStats() {
    return this.circuitBreakerManager.getAllStats();
  }

  /**
   * Get dead letter queue stats
   */
  async getDeadLetterQueueStats() {
    return await this.deadLetterQueue.getStats();
  }

  /**
   * Reset circuit breaker for provider
   */
  resetCircuitBreaker(provider: string): void {
    this.circuitBreakerManager.reset(provider);
  }

  /**
   * Close reliability layer
   */
  async close(): Promise<void> {
    await this.rateLimitManager.close();
    await this.deadLetterQueue.close();
    await this.idempotencyManager.close();
    this.isInitialized = false;
    console.log('[ReliabilityLayer] ✅ Reliability layer closed');
  }
}

// Export singleton instance
let reliabilityLayerInstance: ReliabilityLayer | null = null;

export function getReliabilityLayer(): ReliabilityLayer {
  if (!reliabilityLayerInstance) {
    reliabilityLayerInstance = new ReliabilityLayer();
  }
  return reliabilityLayerInstance;
}
