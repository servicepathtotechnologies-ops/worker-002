/**
 * Idempotency Manager
 * 
 * Ensures idempotent workflow execution.
 * Features:
 * - Idempotency keys
 * - Result caching
 * - Duplicate detection
 * - Automatic deduplication
 */

import { createClient, RedisClientType } from 'redis';

export interface IdempotencyKey {
  key: string;
  executionId: string;
  workflowId: string;
  input: any;
  result?: any;
  createdAt: number;
  expiresAt: number;
}

/**
 * Idempotency Manager
 * Manages idempotent execution
 */
export class IdempotencyManager {
  private redis: RedisClientType | null = null;
  private isConnected = false;
  private readonly keyPrefix = 'idempotency:';
  private inMemoryCache = new Map<string, IdempotencyKey>();

  /**
   * Initialize Redis connection
   */
  async initialize(redisUrl?: string): Promise<void> {
    try {
      const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = createClient({ url }) as RedisClientType;
      
      this.redis.on('error', (err) => {
        console.error('[IdempotencyManager] Redis error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('[IdempotencyManager] ✅ Connected to Redis');
        this.isConnected = true;
      });

      await this.redis.connect();
      console.log('[IdempotencyManager] ✅ Idempotency manager initialized');
    } catch (error) {
      console.warn('[IdempotencyManager] ⚠️  Redis not available, using in-memory cache');
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Generate idempotency key
   */
  generateKey(workflowId: string, input: any): string {
    // Create deterministic key from workflow ID and input
    const inputHash = this.hashInput(input);
    return `${workflowId}:${inputHash}`;
  }

  /**
   * Hash input for idempotency key
   */
  private hashInput(input: any): string {
    // Simple hash function (in production, use crypto.createHash)
    const str = JSON.stringify(input);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if execution is idempotent (already executed)
   */
  async checkIdempotency(
    key: string,
    executionId: string,
    workflowId: string,
    input: any
  ): Promise<{ isDuplicate: boolean; cachedResult?: any }> {
    if (this.isAvailable() && this.redis) {
      return this.checkIdempotencyRedis(key, executionId, workflowId, input);
    } else {
      return this.checkIdempotencyInMemory(key, executionId, workflowId, input);
    }
  }

  /**
   * Check idempotency using Redis
   */
  private async checkIdempotencyRedis(
    key: string,
    executionId: string,
    workflowId: string,
    input: any
  ): Promise<{ isDuplicate: boolean; cachedResult?: any }> {
    const redisKey = `${this.keyPrefix}${key}`;
    const cached = await this.redis!.get(redisKey);

    if (cached) {
      const idempotencyKey: IdempotencyKey = JSON.parse(cached);
      
      // Check if expired
      if (Date.now() > idempotencyKey.expiresAt) {
        await this.redis!.del(redisKey);
        return { isDuplicate: false };
      }

      // Return cached result
      return {
        isDuplicate: true,
        cachedResult: idempotencyKey.result,
      };
    }

    // Store new execution
    const idempotencyKey: IdempotencyKey = {
      key,
      executionId,
      workflowId,
      input,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000, // 24 hours
    };

    await this.redis!.setEx(redisKey, 86400, JSON.stringify(idempotencyKey));

    return { isDuplicate: false };
  }

  /**
   * Check idempotency using in-memory cache
   */
  private checkIdempotencyInMemory(
    key: string,
    executionId: string,
    workflowId: string,
    input: any
  ): { isDuplicate: boolean; cachedResult?: any } {
    const cached = this.inMemoryCache.get(key);

    if (cached) {
      // Check if expired
      if (Date.now() > cached.expiresAt) {
        this.inMemoryCache.delete(key);
        return { isDuplicate: false };
      }

      // Return cached result
      return {
        isDuplicate: true,
        cachedResult: cached.result,
      };
    }

    // Store new execution
    const idempotencyKey: IdempotencyKey = {
      key,
      executionId,
      workflowId,
      input,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000, // 24 hours
    };

    this.inMemoryCache.set(key, idempotencyKey);

    // Clean up old entries (keep cache size manageable)
    if (this.inMemoryCache.size > 1000) {
      const entries = Array.from(this.inMemoryCache.entries());
      entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toRemove = entries.slice(0, 100);
      for (const [k] of toRemove) {
        this.inMemoryCache.delete(k);
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Store execution result
   */
  async storeResult(
    key: string,
    executionId: string,
    workflowId: string,
    input: any,
    result: any
  ): Promise<void> {
    if (this.isAvailable() && this.redis) {
      const redisKey = `${this.keyPrefix}${key}`;
      const idempotencyKey: IdempotencyKey = {
        key,
        executionId,
        workflowId,
        input,
        result,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000, // 24 hours
      };

      await this.redis.setEx(redisKey, 86400, JSON.stringify(idempotencyKey));
    } else {
      const cached = this.inMemoryCache.get(key);
      if (cached) {
        cached.result = result;
        this.inMemoryCache.set(key, cached);
      }
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      console.log('[IdempotencyManager] ✅ Redis connection closed');
    }
  }
}

// Export singleton instance
export const idempotencyManager = new IdempotencyManager();
