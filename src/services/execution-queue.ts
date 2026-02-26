/**
 * Workflow Execution Queue Service
 * 
 * Manages workflow execution queue with:
 * - FIFO execution order
 * - Concurrent execution limits
 * - Worker pool model
 * - System overload prevention
 * - Retry failed jobs
 * - Job status tracking
 * 
 * Uses Redis queue if available, otherwise in-memory queue.
 */

import { getRedisClient, isRedisAvailable } from '../shared/redis-client';
import { EventEmitter } from 'events';

/**
 * Job status
 */
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled';

/**
 * Execution job
 */
export interface ExecutionJob {
  id: string;
  workflowId: string;
  executionId: string;
  input: any;
  userId?: string;
  priority?: number; // Higher priority = executed first (default: 0)
  maxRetries?: number; // Maximum retry attempts (default: 3)
  retryDelay?: number; // Delay between retries in ms (default: 5000)
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: JobStatus;
  retryCount: number;
  error?: string;
  result?: any;
  metadata?: Record<string, any>;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  maxConcurrent: number; // Maximum concurrent executions (default: 5)
  maxQueueSize: number; // Maximum queue size (default: 1000)
  retryDelay: number; // Default retry delay in ms (default: 5000)
  maxRetries: number; // Default max retries (default: 3)
  pollInterval: number; // Poll interval for in-memory queue in ms (default: 1000)
}

/**
 * Queue statistics
 */
export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageWaitTime: number;
  averageExecutionTime: number;
}

/**
 * Queue backend interface
 */
interface QueueBackend {
  enqueue(job: ExecutionJob): Promise<void>;
  dequeue(): Promise<ExecutionJob | null>;
  getJob(jobId: string): Promise<ExecutionJob | null>;
  updateJob(job: ExecutionJob): Promise<void>;
  getQueueSize(): Promise<number>;
  clear(): Promise<void>;
}

/**
 * Redis queue backend
 */
class RedisQueueBackend implements QueueBackend {
  private redis: any;
  private queueKey = 'workflow:execution:queue';
  private jobKeyPrefix = 'workflow:execution:job:';
  private processingKey = 'workflow:execution:processing';
  
  constructor(redis: any) {
    this.redis = redis;
  }
  
  async enqueue(job: ExecutionJob): Promise<void> {
    const jobKey = `${this.jobKeyPrefix}${job.id}`;
    await this.redis.setex(jobKey, 3600, JSON.stringify(job)); // Store for 1 hour
    await this.redis.zadd(this.queueKey, job.priority || 0, job.id);
  }
  
  async dequeue(): Promise<ExecutionJob | null> {
    // Get highest priority job (FIFO for same priority)
    const result = await this.redis.zrange(this.queueKey, 0, 0);
    if (!result || result.length === 0) {
      return null;
    }
    
    const jobId = result[0];
    const jobKey = `${this.jobKeyPrefix}${jobId}`;
    const jobData = await this.redis.get(jobKey);
    
    if (!jobData) {
      // Job expired or missing, remove from queue
      await this.redis.zrem(this.queueKey, jobId);
      return null;
    }
    
    // Move to processing set
    await this.redis.zrem(this.queueKey, jobId);
    await this.redis.zadd(this.processingKey, Date.now(), jobId);
    
    return JSON.parse(jobData);
  }
  
  async getJob(jobId: string): Promise<ExecutionJob | null> {
    const jobKey = `${this.jobKeyPrefix}${jobId}`;
    const jobData = await this.redis.get(jobKey);
    return jobData ? JSON.parse(jobData) : null;
  }
  
  async updateJob(job: ExecutionJob): Promise<void> {
    const jobKey = `${this.jobKeyPrefix}${job.id}`;
    await this.redis.setex(jobKey, 3600, JSON.stringify(job));
  }
  
  async getQueueSize(): Promise<number> {
    return await this.redis.zcard(this.queueKey);
  }
  
  async clear(): Promise<void> {
    const keys = await this.redis.keys(`${this.jobKeyPrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    await this.redis.del(this.queueKey);
    await this.redis.del(this.processingKey);
  }
}

/**
 * In-memory queue backend
 */
class InMemoryQueueBackend implements QueueBackend {
  private queue: ExecutionJob[] = [];
  private jobs: Map<string, ExecutionJob> = new Map();
  private processing: Set<string> = new Set();
  
  async enqueue(job: ExecutionJob): Promise<void> {
    this.jobs.set(job.id, job);
    
    // Insert in priority order (FIFO for same priority)
    const priority = job.priority || 0;
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if ((this.queue[i].priority || 0) < priority) {
        this.queue.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(job);
    }
  }
  
  async dequeue(): Promise<ExecutionJob | null> {
    if (this.queue.length === 0) {
      return null;
    }
    
    const job = this.queue.shift()!;
    this.processing.add(job.id);
    return job;
  }
  
  async getJob(jobId: string): Promise<ExecutionJob | null> {
    return this.jobs.get(jobId) || null;
  }
  
  async updateJob(job: ExecutionJob): Promise<void> {
    this.jobs.set(job.id, job);
  }
  
  async getQueueSize(): Promise<number> {
    return this.queue.length;
  }
  
  async clear(): Promise<void> {
    this.queue = [];
    this.jobs.clear();
    this.processing.clear();
  }
}

/**
 * Execution Queue Manager
 */
export class ExecutionQueue extends EventEmitter {
  private backend!: QueueBackend; // Initialized in initialize()
  private config: QueueConfig;
  private workers: Set<string> = new Set(); // Active worker IDs
  private running: Map<string, Promise<void>> = new Map(); // Running job promises
  private stats: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    totalProcessed: number;
    waitTimes: number[];
    executionTimes: number[];
  } = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    totalProcessed: 0,
    waitTimes: [],
    executionTimes: [],
  };
  private pollInterval?: NodeJS.Timeout;
  private isProcessing = false;
  
  constructor(config?: Partial<QueueConfig>) {
    super();
    
    this.config = {
      maxConcurrent: config?.maxConcurrent || 5,
      maxQueueSize: config?.maxQueueSize || 1000,
      retryDelay: config?.retryDelay || 5000,
      maxRetries: config?.maxRetries || 3,
      pollInterval: config?.pollInterval || 1000,
    };
  }
  
  /**
   * Initialize queue backend
   */
  async initialize(): Promise<void> {
    const redisAvailable = await isRedisAvailable();
    
    if (redisAvailable) {
      const redis = await getRedisClient();
      if (redis) {
        this.backend = new RedisQueueBackend(redis);
        console.log('[ExecutionQueue] ✅ Using Redis queue backend');
        return;
      }
    }
    
    // Fallback to in-memory queue
    this.backend = new InMemoryQueueBackend();
    console.log('[ExecutionQueue] ⚠️  Using in-memory queue backend (Redis not available)');
    
    // Start polling for in-memory queue
    this.startPolling();
  }
  
  /**
   * Start polling for jobs (in-memory queue only)
   */
  private startPolling(): void {
    if (this.pollInterval) {
      return;
    }
    
    this.pollInterval = setInterval(async () => {
      if (!this.isProcessing && this.running.size < this.config.maxConcurrent) {
        await this.processNextJob();
      }
    }, this.config.pollInterval);
  }
  
  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }
  
  /**
   * Add job to queue
   */
  async enqueue(
    workflowId: string,
    executionId: string,
    input: any,
    options?: {
      userId?: string;
      priority?: number;
      maxRetries?: number;
      retryDelay?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check queue size
    const queueSize = await this.backend.getQueueSize();
    if (queueSize >= this.config.maxQueueSize) {
      throw new Error(`Queue is full (max size: ${this.config.maxQueueSize})`);
    }
    
    const job: ExecutionJob = {
      id: jobId,
      workflowId,
      executionId,
      input,
      userId: options?.userId,
      priority: options?.priority || 0,
      maxRetries: options?.maxRetries || this.config.maxRetries,
      retryDelay: options?.retryDelay || this.config.retryDelay,
      createdAt: Date.now(),
      status: 'queued',
      retryCount: 0,
      metadata: options?.metadata,
    };
    
    await this.backend.enqueue(job);
    this.stats.pending++;
    
    this.emit('job:queued', job);
    console.log(`[ExecutionQueue] Job queued: ${jobId} (workflow: ${workflowId})`);
    
    // Trigger processing if not already running
    if (!this.isProcessing && this.running.size < this.config.maxConcurrent) {
      this.processNextJob();
    }
    
    return jobId;
  }
  
  /**
   * Process next job from queue
   */
  private async processNextJob(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    
    if (this.running.size >= this.config.maxConcurrent) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const job = await this.backend.dequeue();
      
      if (!job) {
        this.isProcessing = false;
        return;
      }
      
      // Update job status
      job.status = 'running';
      job.startedAt = Date.now();
      const waitTime = job.startedAt - job.createdAt;
      this.stats.waitTimes.push(waitTime);
      this.stats.pending--;
      this.stats.running++;
      
      await this.backend.updateJob(job);
      this.emit('job:started', job);
      
      // Execute job
      const executionPromise = this.executeJob(job);
      this.running.set(job.id, executionPromise);
      
      executionPromise.finally(() => {
        this.running.delete(job.id);
        this.stats.running--;
        this.isProcessing = false;
        
        // Process next job
        if (this.running.size < this.config.maxConcurrent) {
          this.processNextJob();
        }
      });
      
    } catch (error) {
      console.error('[ExecutionQueue] Error processing job:', error);
      this.isProcessing = false;
    }
  }
  
  /**
   * Execute job
   */
  private async executeJob(job: ExecutionJob): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[ExecutionQueue] Executing job: ${job.id} (workflow: ${job.workflowId})`);
      
      // Import execute workflow handler
      const executeWorkflowHandler = (await import('../api/execute-workflow')).default;
      
      // Create request/response objects
      let executionResult: any = null;
      let executionError: any = null;
      let responseStatus = 200;
      
      const req = {
        body: {
          workflowId: job.workflowId,
          executionId: job.executionId,
          input: job.input,
          useQueue: false, // Prevent recursive queueing
        },
        headers: {
          authorization: job.userId ? `Bearer ${job.userId}` : undefined,
          // Preserve internal execution headers from metadata
          ...(job.metadata?.headers || {}),
        },
      } as any;
      
      const res = {
        statusCode: 200,
        status: (code: number) => {
          responseStatus = code;
          return res;
        },
        json: (data: any) => {
          executionResult = data;
          if (responseStatus >= 200 && responseStatus < 300) {
            job.result = data;
            job.status = 'completed';
          } else {
            job.status = 'failed';
            job.error = data.error || data.message || 'Execution failed';
          }
          return res;
        },
        send: (data: any) => {
          executionResult = data;
          if (responseStatus >= 200 && responseStatus < 300) {
            job.result = data;
            job.status = 'completed';
          } else {
            job.status = 'failed';
            job.error = typeof data === 'string' ? data : (data?.error || 'Execution failed');
          }
          return res;
        },
      } as any;
      
      // Execute workflow
      try {
        await executeWorkflowHandler(req, res);
        
        // Check if execution was successful
        if (responseStatus >= 200 && responseStatus < 300 && !executionResult) {
          // Handler might have sent response but not set executionResult
          job.result = { status: 'success' };
          job.status = 'completed';
        }
      } catch (error: any) {
        executionError = error;
        job.error = error.message || String(error);
        throw error;
      }
      
      // Update job status
      job.completedAt = Date.now();
      const executionTime = job.completedAt - (job.startedAt || startTime);
      this.stats.executionTimes.push(executionTime);
      this.stats.completed++;
      this.stats.totalProcessed++;
      
      await this.backend.updateJob(job);
      this.emit('job:completed', job);
      
      console.log(`[ExecutionQueue] Job completed: ${job.id} (${executionTime}ms)`);
      
    } catch (error: any) {
      console.error(`[ExecutionQueue] Job failed: ${job.id}`, error);
      
      job.error = error.message || String(error);
      job.retryCount++;
      
      // Check if should retry
      if (job.retryCount <= (job.maxRetries || this.config.maxRetries)) {
        job.status = 'retrying';
        this.emit('job:retrying', job);
        
        // Re-queue with delay
        setTimeout(async () => {
          job.status = 'queued';
          job.createdAt = Date.now(); // Reset creation time for wait time calculation
          await this.backend.enqueue(job);
          this.stats.pending++;
          
          if (!this.isProcessing && this.running.size < this.config.maxConcurrent) {
            this.processNextJob();
          }
        }, job.retryDelay || this.config.retryDelay);
        
      } else {
        // Max retries exceeded
        job.status = 'failed';
        job.completedAt = Date.now();
        this.stats.failed++;
        this.stats.totalProcessed++;
        this.emit('job:failed', job);
      }
      
      await this.backend.updateJob(job);
    }
  }
  
  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<ExecutionJob | null> {
    return await this.backend.getJob(jobId);
  }
  
  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.backend.getJob(jobId);
    
    if (!job) {
      return false;
    }
    
    if (job.status === 'running') {
      // Cannot cancel running job
      return false;
    }
    
    job.status = 'cancelled';
    await this.backend.updateJob(job);
    this.emit('job:cancelled', job);
    
    return true;
  }
  
  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    const queueSize = await this.backend.getQueueSize();
    
    const averageWaitTime = this.stats.waitTimes.length > 0
      ? this.stats.waitTimes.reduce((a, b) => a + b, 0) / this.stats.waitTimes.length
      : 0;
    
    const averageExecutionTime = this.stats.executionTimes.length > 0
      ? this.stats.executionTimes.reduce((a, b) => a + b, 0) / this.stats.executionTimes.length
      : 0;
    
    return {
      pending: queueSize,
      running: this.stats.running,
      completed: this.stats.completed,
      failed: this.stats.failed,
      totalProcessed: this.stats.totalProcessed,
      averageWaitTime,
      averageExecutionTime,
    };
  }
  
  /**
   * Clear queue
   */
  async clear(): Promise<void> {
    await this.backend.clear();
    this.stats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      totalProcessed: 0,
      waitTimes: [],
      executionTimes: [],
    };
    this.emit('queue:cleared');
  }
  
  /**
   * Shutdown queue
   */
  async shutdown(): Promise<void> {
    this.stopPolling();
    
    // Wait for running jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.running.size > 0 && (Date.now() - startTime) < timeout) {
      await Promise.race(Array.from(this.running.values()));
    }
    
    console.log('[ExecutionQueue] Queue shutdown complete');
  }
}

// Export singleton instance
let executionQueueInstance: ExecutionQueue | null = null;

export async function getExecutionQueue(config?: Partial<QueueConfig>): Promise<ExecutionQueue> {
  if (!executionQueueInstance) {
    executionQueueInstance = new ExecutionQueue(config);
    await executionQueueInstance.initialize();
  }
  return executionQueueInstance;
}

// Types are already exported above, no need to re-export
