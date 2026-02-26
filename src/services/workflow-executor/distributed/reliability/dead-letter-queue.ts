/**
 * Dead Letter Queue
 * 
 * Stores failed jobs that cannot be retried.
 * Features:
 * - Persistent storage in Redis
 * - Job metadata and error details
 * - Query and replay support
 */

import { createClient, RedisClientType } from 'redis';
import { QueueJob } from '../redis-queue-manager';

export interface DeadLetterJob {
  id: string;
  originalJob: QueueJob;
  error: string;
  errorStack?: string;
  failedAt: number;
  retryCount: number;
  reason: 'max_retries' | 'circuit_open' | 'timeout' | 'rate_limit' | 'unknown';
  metadata?: Record<string, any>;
}

/**
 * Dead Letter Queue
 * Stores permanently failed jobs
 */
export class DeadLetterQueue {
  private redis: RedisClientType | null = null;
  private isConnected = false;
  private readonly dlqKeyPrefix = 'dlq:job:';
  private readonly dlqIndexKey = 'dlq:index';
  private readonly dlqByReasonKey = 'dlq:by_reason:';

  /**
   * Initialize Redis connection
   */
  async initialize(redisUrl?: string): Promise<void> {
    try {
      const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = createClient({ url }) as RedisClientType;
      
      this.redis.on('error', (err) => {
        console.error('[DeadLetterQueue] Redis error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('[DeadLetterQueue] ✅ Connected to Redis');
        this.isConnected = true;
      });

      await this.redis.connect();
      console.log('[DeadLetterQueue] ✅ Dead letter queue initialized');
    } catch (error) {
      console.error('[DeadLetterQueue] ❌ Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Add job to dead letter queue
   */
  async addJob(
    job: QueueJob,
    error: Error | string,
    reason: DeadLetterJob['reason'] = 'unknown'
  ): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Dead letter queue not available');
    }

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const dlqJob: DeadLetterJob = {
      id: job.id,
      originalJob: job,
      error: errorMessage,
      errorStack,
      failedAt: Date.now(),
      retryCount: job.retryCount,
      reason,
      metadata: job.metadata,
    };

    const jobKey = `${this.dlqKeyPrefix}${job.id}`;
    const jobData = JSON.stringify(dlqJob);

    // Store job
    await this.redis!.setEx(jobKey, 2592000, jobData); // 30 days TTL

    // Add to index
    await this.redis!.sAdd(this.dlqIndexKey, job.id);

    // Add to reason index
    await this.redis!.sAdd(`${this.dlqByReasonKey}${reason}`, job.id);

    console.log(`[DeadLetterQueue] ✅ Added job ${job.id} to DLQ (reason: ${reason})`);
  }

  /**
   * Get job from dead letter queue
   */
  async getJob(jobId: string): Promise<DeadLetterJob | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const jobKey = `${this.dlqKeyPrefix}${jobId}`;
    const jobData = await this.redis!.get(jobKey);

    if (!jobData) {
      return null;
    }

    return JSON.parse(jobData);
  }

  /**
   * Get all jobs in dead letter queue
   */
  async getAllJobs(limit = 100): Promise<DeadLetterJob[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const jobIds = await this.redis!.sMembers(this.dlqIndexKey);
    const jobs: DeadLetterJob[] = [];

    for (const jobId of jobIds.slice(0, limit)) {
      const job = await this.getJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs.sort((a, b) => b.failedAt - a.failedAt); // Most recent first
  }

  /**
   * Get jobs by reason
   */
  async getJobsByReason(reason: DeadLetterJob['reason'], limit = 100): Promise<DeadLetterJob[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const jobIds = await this.redis!.sMembers(`${this.dlqByReasonKey}${reason}`);
    const jobs: DeadLetterJob[] = [];

    for (const jobId of jobIds.slice(0, limit)) {
      const job = await this.getJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs.sort((a, b) => b.failedAt - a.failedAt);
  }

  /**
   * Remove job from dead letter queue
   */
  async removeJob(jobId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const job = await this.getJob(jobId);
    if (!job) {
      return;
    }

    const jobKey = `${this.dlqKeyPrefix}${jobId}`;
    await this.redis!.del(jobKey);
    await this.redis!.sRem(this.dlqIndexKey, jobId);
    await this.redis!.sRem(`${this.dlqByReasonKey}${job.reason}`, jobId);

    console.log(`[DeadLetterQueue] ✅ Removed job ${jobId} from DLQ`);
  }

  /**
   * Get dead letter queue statistics
   */
  async getStats(): Promise<{
    total: number;
    byReason: Record<string, number>;
  }> {
    if (!this.isAvailable()) {
      return { total: 0, byReason: {} };
    }

    const total = await this.redis!.sCard(this.dlqIndexKey);
    const reasons: DeadLetterJob['reason'][] = ['max_retries', 'circuit_open', 'timeout', 'rate_limit', 'unknown'];
    const byReason: Record<string, number> = {};

    for (const reason of reasons) {
      const count = await this.redis!.sCard(`${this.dlqByReasonKey}${reason}`);
      byReason[reason] = count;
    }

    return { total, byReason };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      console.log('[DeadLetterQueue] ✅ Redis connection closed');
    }
  }
}

// Export singleton instance
let dlqInstance: DeadLetterQueue | null = null;

export function getDeadLetterQueue(): DeadLetterQueue {
  if (!dlqInstance) {
    dlqInstance = new DeadLetterQueue();
  }
  return dlqInstance;
}
