/**
 * Queue Client - Abstraction for Queue System
 * 
 * Supports RabbitMQ and Redis for job distribution.
 * Provides unified interface for publishing and consuming node jobs.
 */

import * as amqp from 'amqplib';
import { createClient, RedisClientType } from 'redis';

export interface NodeJob {
  execution_id: string;
  node_id: string;
  node_type: string;
  step_id?: string;
  priority?: number;
  retry_attempt?: number;
  published_at?: string;
  job_id?: string; // Unique job ID for idempotency
  delay_ms?: number; // Delay before processing (for exponential backoff)
}

export interface QueueConfig {
  type: 'rabbitmq' | 'redis';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  queueName?: string;
}

/**
 * Queue Client - Unified interface for queue operations
 */
export class QueueClient {
  private config: QueueConfig;
  private rabbitmqConnection: any = null; // Using 'any' to work around amqplib type issues
  private rabbitmqChannel: any = null; // Using 'any' to work around amqplib type issues
  private redisClient: RedisClientType | null = null;
  private queueName: string;
  private redisConnectionState: 'connected' | 'disconnected' | 'unknown' = 'unknown';
  private lastRedisErrorTime: number = 0;
  private readonly REDIS_ERROR_THROTTLE_MS = 10000; // Only log errors every 10 seconds

  constructor(config: QueueConfig) {
    this.config = config;
    this.queueName = config.queueName || 'workflow-nodes';
  }

  /**
   * Initialize queue connection
   */
  async connect(): Promise<void> {
    if (this.config.type === 'rabbitmq') {
      await this.connectRabbitMQ();
    } else if (this.config.type === 'redis') {
      await this.connectRedis();
    } else {
      throw new Error(`Unsupported queue type: ${this.config.type}`);
    }
  }

  /**
   * Connect to RabbitMQ
   */
  private async connectRabbitMQ(): Promise<void> {
    const url = `amqp://${this.config.username || 'guest'}:${this.config.password || 'guest'}@${this.config.host || 'localhost'}:${this.config.port || 5672}`;
    
    try {
      // amqp.connect returns a Connection, but TypeScript types may be incorrect
      // Use type assertion to work around this
      const connection = await amqp.connect(url);
      this.rabbitmqConnection = connection as unknown as amqp.Connection;
      
      if (!this.rabbitmqConnection) {
        throw new Error('Failed to establish RabbitMQ connection');
      }
      
      // createChannel exists on the connection object
      const channel = await (this.rabbitmqConnection as any).createChannel();
      this.rabbitmqChannel = channel as amqp.Channel;
      
      if (!this.rabbitmqChannel) {
        throw new Error('Failed to create RabbitMQ channel');
      }
      
      // Declare main queue with dead letter exchange
      if (this.rabbitmqChannel) {
        await this.rabbitmqChannel.assertQueue(this.queueName, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': 'workflow-dlx',
            'x-dead-letter-routing-key': 'workflow-failed',
            'x-max-priority': 10
          }
        });

        // Declare retry queue
        await this.rabbitmqChannel.assertQueue('workflow-retry', {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': this.queueName,
            'x-message-ttl': 30000,  // 30 second delay before retry
          }
        });

        // Declare failed queue
        await this.rabbitmqChannel.assertQueue('workflow-failed', {
          durable: true
        });

        // Declare dead letter exchange
        await this.rabbitmqChannel.assertExchange('workflow-dlx', 'direct', {
          durable: true
        });
        await this.rabbitmqChannel.bindQueue('workflow-failed', 'workflow-dlx', 'workflow-failed');
      }

      console.log(`[QueueClient] ✅ Connected to RabbitMQ: ${this.queueName}`);
    } catch (error) {
      console.error('[QueueClient] ❌ Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  /**
   * Connect to Redis
   */
  private async connectRedis(): Promise<void> {
    try {
      this.redisClient = createClient({
        socket: {
          host: this.config.host || 'localhost',
          port: this.config.port || 6379,
          reconnectStrategy: (retries) => {
            // Exponential backoff with max delay of 5 seconds
            const delay = Math.min(retries * 100, 5000);
            return delay;
          },
        },
        password: this.config.password,
      });

      // Only log errors when state changes or after throttle period
      this.redisClient.on('error', (err: any) => {
        const now = Date.now();
        const isConnectionError = err.code === 'ECONNREFUSED' || 
                                 err.message?.includes('ECONNREFUSED') ||
                                 err.message?.includes('connect');
        
        // Only log if state changed or throttle period passed
        if (this.redisConnectionState !== 'disconnected' || 
            (now - this.lastRedisErrorTime) > this.REDIS_ERROR_THROTTLE_MS) {
          
          if (this.redisConnectionState !== 'disconnected') {
            this.redisConnectionState = 'disconnected';
            console.warn('[QueueClient] ⚠️  Redis connection lost');
            console.warn(`   Error: ${err.message || err.code || 'Connection failed'}`);
            console.warn(`   Host: ${this.config.host || 'localhost'}:${this.config.port || 6379}`);
            console.warn('   💡 To start Redis:');
            console.warn('      - Docker: docker run -d -p 6379:6379 redis:7-alpine');
            console.warn('      - Or: docker-compose -f docker-compose.distributed.yml up -d redis');
            console.warn('   ⚠️  Distributed workflow features will be unavailable until Redis is running');
            console.warn('   🔄 Reconnection attempts will continue silently...');
          }
          
          this.lastRedisErrorTime = now;
        }
      });

      this.redisClient.on('connect', () => {
        if (this.redisConnectionState !== 'connected') {
          this.redisConnectionState = 'connected';
          console.log(`[QueueClient] ✅ Connected to Redis at ${this.config.host || 'localhost'}:${this.config.port || 6379}`);
        }
      });

      this.redisClient.on('ready', () => {
        if (this.redisConnectionState !== 'connected') {
          this.redisConnectionState = 'connected';
          console.log(`[QueueClient] ✅ Redis ready`);
        }
      });

      await this.redisClient.connect();
      
      if (this.redisConnectionState !== 'connected') {
        this.redisConnectionState = 'connected';
        console.log(`[QueueClient] ✅ Connected to Redis at ${this.config.host || 'localhost'}:${this.config.port || 6379}`);
      }
    } catch (error: any) {
      this.redisConnectionState = 'disconnected';
      const isConnectionError = error.code === 'ECONNREFUSED' || 
                               error.message?.includes('ECONNREFUSED') ||
                               error.message?.includes('connect');
      
      if (isConnectionError) {
        console.error('[QueueClient] ❌ Failed to connect to Redis');
        console.error(`   Host: ${this.config.host || 'localhost'}:${this.config.port || 6379}`);
        console.error(`   Error: ${error.message || error.code || 'Connection refused'}`);
        console.error('   💡 To start Redis:');
        console.error('      - Docker: docker run -d -p 6379:6379 redis:7-alpine');
        console.error('      - Or: docker-compose -f docker-compose.distributed.yml up -d redis');
        console.error('   ⚠️  Distributed workflow features will be unavailable until Redis is running');
      } else {
        console.error('[QueueClient] ❌ Failed to connect to Redis:', error);
      }
      throw error;
    }
  }

  /**
   * Publish node job to queue
   */
  async publishJob(job: NodeJob): Promise<void> {
    if (this.config.type === 'rabbitmq') {
      await this.publishRabbitMQ(job);
    } else if (this.config.type === 'redis') {
      await this.publishRedis(job);
    }
  }

  /**
   * Publish to RabbitMQ
   */
  private async publishRabbitMQ(job: NodeJob): Promise<void> {
    if (!this.rabbitmqChannel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const message = JSON.stringify({
      ...job,
      published_at: new Date().toISOString(),
    });

    await this.rabbitmqChannel.sendToQueue(
      this.queueName,
      Buffer.from(message),
      {
        persistent: true,
        priority: job.priority || 5,
        messageId: `${job.execution_id}-${job.node_id}-${Date.now()}`,
      }
    );

    console.log(`[QueueClient] 📤 Published job: ${job.execution_id}/${job.node_id}`);
  }

  /**
   * Publish to Redis
   */
  private async publishRedis(job: NodeJob): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    // Generate unique job ID for idempotency
    const jobId = job.job_id || `${job.execution_id}-${job.node_id}-${Date.now()}`;
    
    const message = JSON.stringify({
      ...job,
      job_id: jobId,
      published_at: new Date().toISOString(),
    });

    // If delay is specified, use delayed queue (sorted set with score = current time + delay)
    if (job.delay_ms && job.delay_ms > 0) {
      const delayedQueueName = `${this.queueName}:delayed`;
      const score = Date.now() + job.delay_ms;
      await this.redisClient.zAdd(delayedQueueName, {
        score,
        value: message,
      });
      console.log(`[QueueClient] 📤 Published delayed job: ${job.execution_id}/${job.node_id} (delay: ${job.delay_ms}ms)`);
    } else {
      await this.redisClient.lPush(this.queueName, message);
      console.log(`[QueueClient] 📤 Published job: ${job.execution_id}/${job.node_id}`);
    }
  }

  /**
   * Consume jobs from queue
   */
  async consumeJobs(
    onJob: (job: NodeJob) => Promise<void>,
    options?: { prefetch?: number }
  ): Promise<void> {
    if (this.config.type === 'rabbitmq') {
      await this.consumeRabbitMQ(onJob, options);
    } else if (this.config.type === 'redis') {
      await this.consumeRedis(onJob);
    }
  }

  /**
   * Consume from RabbitMQ
   */
  private async consumeRabbitMQ(
    onJob: (job: NodeJob) => Promise<void>,
    options?: { prefetch?: number }
  ): Promise<void> {
    if (!this.rabbitmqChannel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    // Set prefetch limit
    await this.rabbitmqChannel.prefetch(options?.prefetch || 1);

    await this.rabbitmqChannel.consume(
      this.queueName,
      async (msg: amqp.ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const job: NodeJob = JSON.parse(msg.content.toString());
          await onJob(job);
          this.rabbitmqChannel!.ack(msg);
        } catch (error) {
          console.error('[QueueClient] ❌ Error processing job:', error);
          // Nack and requeue
          this.rabbitmqChannel!.nack(msg, false, true);
        }
      },
      { noAck: false }
    );

    console.log(`[QueueClient] 👂 Listening for jobs on: ${this.queueName}`);
  }

  /**
   * Consume from Redis (blocking pop with delayed queue support)
   */
  private async consumeRedis(
    onJob: (job: NodeJob) => Promise<void>
  ): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    const delayedQueueName = `${this.queueName}:delayed`;

    // Use blocking pop for job consumption
    while (true) {
      try {
        // 1. Check delayed queue for jobs ready to process
        const now = Date.now();
        const readyJobs = await this.redisClient.zRangeByScore(
          delayedQueueName,
          '-inf',
          now,
          { LIMIT: { offset: 0, count: 10 } }
        );

        // Move ready jobs to main queue
        for (const jobMessage of readyJobs) {
          await this.redisClient.zRem(delayedQueueName, jobMessage);
          await this.redisClient.lPush(this.queueName, jobMessage);
        }

        // 2. Consume from main queue
        const result = await this.redisClient.brPop(
          this.queueName,
          5  // timeout in seconds
        );

        if (result) {
          const job: NodeJob = JSON.parse(result.element);
          await onJob(job);
        }
      } catch (error) {
        console.error('[QueueClient] ❌ Error consuming from Redis:', error);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
      }
    }
  }

  /**
   * Publish job with exponential backoff delay
   */
  async publishJobWithBackoff(
    job: NodeJob,
    retryAttempt: number = 0,
    baseDelayMs: number = 1000
  ): Promise<void> {
    // Calculate exponential backoff: baseDelay * 2^retryAttempt
    const delayMs = baseDelayMs * Math.pow(2, retryAttempt);
    
    await this.publishJob({
      ...job,
      retry_attempt: retryAttempt,
      delay_ms: delayMs,
    });
  }

  /**
   * Publish to dead-letter queue
   */
  async publishToDeadLetter(job: NodeJob, error: string): Promise<void> {
    const deadLetterQueueName = `${this.queueName}:dead-letter`;
    const message = JSON.stringify({
      ...job,
      error,
      failed_at: new Date().toISOString(),
    });

    if (this.config.type === 'rabbitmq') {
      // RabbitMQ dead-letter queue is already set up
      if (this.rabbitmqChannel) {
        await this.rabbitmqChannel.sendToQueue('workflow-failed', Buffer.from(message), {
          persistent: true,
        });
      }
    } else if (this.config.type === 'redis') {
      if (this.redisClient) {
        await this.redisClient.lPush(deadLetterQueueName, message);
      }
    }

    console.log(`[QueueClient] 💀 Published to dead-letter queue: ${job.execution_id}/${job.node_id}`);
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.rabbitmqConnection) {
      try {
        // close() method exists but TypeScript types may not reflect it
        await (this.rabbitmqConnection as any).close();
      } catch (error) {
        console.error('[QueueClient] Error closing RabbitMQ connection:', error);
      }
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

/**
 * Create queue client from environment variables
 */
export function createQueueClient(): QueueClient {
  const queueType = (process.env.QUEUE_TYPE || 'redis').toLowerCase();
  const config: QueueConfig = {
    type: queueType === 'rabbitmq' ? 'rabbitmq' : 'redis',
    host: process.env.QUEUE_HOST || (queueType === 'rabbitmq' ? 'localhost' : 'localhost'),
    port: parseInt(process.env.QUEUE_PORT || (queueType === 'rabbitmq' ? '5672' : '6379'), 10),
    username: process.env.QUEUE_USERNAME,
    password: process.env.QUEUE_PASSWORD,
    queueName: process.env.QUEUE_NAME || 'workflow-nodes',
  };

  return new QueueClient(config);
}
