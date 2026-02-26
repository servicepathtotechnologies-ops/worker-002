/**
 * Stateless Worker
 * 
 * Stateless worker that processes workflow tasks from queue.
 * Features:
 * - Stateless design (no in-memory state)
 * - Automatic retry handling
 * - Checkpoint support
 * - Horizontal scaling support
 */

import { RedisQueueManager, QueueJob } from './redis-queue-manager';
import { ExecutionStateStore } from './execution-state-store';
import { WorkflowNode } from '../../../core/types/ai-types';
import { randomUUID } from 'crypto';
import { ReliabilityLayer, getReliabilityLayer, ReliabilityConfig, ExecutionContext } from './reliability/reliability-layer';

export interface WorkerConfig {
  workerId: string;
  nodeTypes?: string[]; // Specific node types to process (empty = all)
  maxConcurrent?: number; // Max concurrent tasks
  pollInterval?: number; // Poll interval in ms
}

export interface WorkerMetrics {
  processed: number;
  failed: number;
  retried: number;
  averageProcessingTime: number;
  uptime: number;
}

/**
 * Stateless Worker
 * Processes workflow tasks from queue
 */
export class StatelessWorker {
  private workerId: string;
  private queueManager: RedisQueueManager;
  private stateStore: ExecutionStateStore;
  private reliabilityLayer!: ReliabilityLayer; // Initialized in initialize()
  private config: WorkerConfig;
  private isRunning = false;
  private activeTasks = new Map<string, NodeJS.Timeout>();
  private metrics: WorkerMetrics = {
    processed: 0,
    failed: 0,
    retried: 0,
    averageProcessingTime: 0,
    uptime: 0,
  };
  private startTime = Date.now();
  private processingTimes: number[] = [];

  constructor(config: WorkerConfig) {
    this.workerId = config.workerId || `worker-${randomUUID()}`;
    this.config = {
      workerId: this.workerId,
      nodeTypes: config.nodeTypes || [],
      maxConcurrent: config.maxConcurrent || 5,
      pollInterval: config.pollInterval || 1000,
    };
    this.queueManager = new RedisQueueManager();
    this.stateStore = new ExecutionStateStore();
  }

  /**
   * Initialize worker
   */
  async initialize(redisUrl?: string): Promise<void> {
    await this.queueManager.initialize(redisUrl);
    await this.stateStore.initialize(redisUrl);
    this.reliabilityLayer = getReliabilityLayer();
    await this.reliabilityLayer.initialize(redisUrl);
    console.log(`[StatelessWorker] ✅ Worker ${this.workerId} initialized`);
  }

  /**
   * Start worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[StatelessWorker] ⚠️  Worker ${this.workerId} already running`);
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    console.log(`[StatelessWorker] 🚀 Starting worker ${this.workerId}`);

    // Start polling loop
    this.poll();
  }

  /**
   * Stop worker
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Cancel all active tasks
    for (const timeout of this.activeTasks.values()) {
      clearTimeout(timeout);
    }
    this.activeTasks.clear();

    await this.queueManager.close();
    await this.stateStore.close();
    console.log(`[StatelessWorker] ✅ Worker ${this.workerId} stopped`);
  }

  /**
   * Poll for jobs
   */
  private async poll(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check if we can process more tasks
        if (this.activeTasks.size >= (this.config.maxConcurrent || 5)) {
          await this.sleep(this.config.pollInterval || 1000);
          continue;
        }

        // Dequeue job
        const job = await this.queueManager.dequeue(this.workerId);
        
        if (job) {
          // Check if we should process this node type
          if (this.config.nodeTypes && this.config.nodeTypes.length > 0) {
            if (!this.config.nodeTypes.includes(job.nodeType)) {
              // Re-enqueue job (different worker will handle it)
              await this.queueManager.enqueue(job);
              await this.sleep(this.config.pollInterval || 1000);
              continue;
            }
          }

          // Process job asynchronously
          this.processJob(job).catch(error => {
            console.error(`[StatelessWorker] ❌ Error processing job ${job.id}:`, error);
            this.metrics.failed++;
          });
        } else {
          // No jobs available, wait before polling again
          await this.sleep(this.config.pollInterval || 1000);
        }
      } catch (error) {
        console.error(`[StatelessWorker] ❌ Error in poll loop:`, error);
        await this.sleep(this.config.pollInterval || 1000);
      }
    }
  }

  /**
   * Process job
   */
  private async processJob(job: QueueJob): Promise<void> {
    const startTime = Date.now();
    const taskId = `${job.id}-${Date.now()}`;

    // Mark task as active
    const timeout = setTimeout(() => {
      console.warn(`[StatelessWorker] ⚠️  Job ${job.id} exceeded timeout`);
      this.activeTasks.delete(taskId);
    }, 300000); // 5 minute timeout
    this.activeTasks.set(taskId, timeout);

    try {
      console.log(`[StatelessWorker] 🔄 Processing job ${job.id} (node: ${job.nodeId}, type: ${job.nodeType})`);

      // Update job status
      job.status = 'running';
      await this.queueManager.updateJob(job);

      // Get execution state
      const state = await this.stateStore.getState(job.executionId);
      if (!state) {
        throw new Error(`Execution state ${job.executionId} not found`);
      }

      // Execute node
      const result = await this.executeNode(job, state);

      // Mark node as completed
      await this.stateStore.markNodeCompleted(job.executionId, job.nodeId, result);

      // Update job status
      job.status = 'completed';
      job.result = result;
      await this.queueManager.updateJob(job);

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift(); // Keep last 100
      }
      this.metrics.processed++;
      this.metrics.averageProcessingTime = 
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;

      console.log(`[StatelessWorker] ✅ Completed job ${job.id} in ${processingTime}ms`);

      // TODO: Schedule next nodes in workflow
      // This would involve:
      // 1. Finding edges from this node
      // 2. Checking if all dependencies are met
      // 3. Scheduling dependent nodes

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[StatelessWorker] ❌ Job ${job.id} failed: ${errorMessage}`);

      // Mark node as failed
      await this.stateStore.markNodeFailed(job.executionId, job.nodeId, errorMessage);

      // Update job status
      job.status = 'failed';
      job.error = errorMessage;
      await this.queueManager.updateJob(job);

      // Retry if possible
      if (job.retryCount < job.maxRetries) {
        try {
          await this.queueManager.retryJob(job.id, job.retryDelay);
          this.metrics.retried++;
          console.log(`[StatelessWorker] ✅ Scheduled retry ${job.retryCount + 1}/${job.maxRetries} for job ${job.id}`);
        } catch (retryError) {
          console.error(`[StatelessWorker] ❌ Failed to retry job ${job.id}:`, retryError);
        }
      } else {
        this.metrics.failed++;
        console.error(`[StatelessWorker] ❌ Job ${job.id} exceeded max retries`);
      }
    } finally {
      // Remove task from active set
      clearTimeout(timeout);
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Execute node with reliability protection
   */
  private async executeNode(job: QueueJob, state: any): Promise<any> {
    console.log(`[StatelessWorker] Executing node ${job.nodeId} (${job.nodeType})`);

    // Extract provider from node type
    const provider = this.extractProvider(job.nodeType);

    // Create execution context
    const context: ExecutionContext = {
      executionId: job.executionId,
      workflowId: job.workflowId,
      nodeId: job.nodeId,
      nodeType: job.nodeType,
      provider,
      input: job.input,
      idempotencyKey: `${job.executionId}:${job.nodeId}:${JSON.stringify(job.input)}`,
    };

    // Configure reliability
    const reliabilityConfig: ReliabilityConfig = {
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        resetTimeout: 300000,
      },
      rateLimit: provider ? {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
        burst: 10,
      } : undefined,
      retry: {
        maxRetries: job.maxRetries,
        initialDelay: job.retryDelay,
        maxDelay: 60000,
        multiplier: 2,
        jitter: true,
        strategy: 'exponential',
      },
      timeout: {
        timeout: 300000, // 5 minutes
      },
      idempotency: {
        enabled: true,
        ttl: 86400000, // 24 hours
      },
    };

    // Execute with reliability layer
    const result = await this.reliabilityLayer.execute(
      context,
      async () => {
        // Actual node execution logic
        // TODO: Implement actual node execution
        // This would involve:
        // 1. Loading node configuration
        // 2. Executing node logic
        // 3. Returning result

        // Placeholder implementation
        await this.sleep(100);
        
        return {
          nodeId: job.nodeId,
          nodeType: job.nodeType,
          output: job.input, // Placeholder
          timestamp: Date.now(),
        };
      },
      reliabilityConfig
    );

    if (!result.success) {
      throw result.error || new Error('Node execution failed');
    }

    return result.result;
  }

  /**
   * Extract provider from node type
   */
  private extractProvider(nodeType: string): string | undefined {
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
   * Get worker metrics
   */
  getMetrics(): WorkerMetrics {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
