import { Request, Response } from 'express';
import { Consumer, Kafka, Producer } from 'kafkajs';
import { dbProxyDelete, dbProxyPost, dbProxyPut, dbProxyUpsert } from '../api/db-proxy';
import { QueuedWriteRequest, createKafkaClient } from '../middleware/kafkaRequestQueue';

const REQUEST_TOPIC = process.env.KAFKA_REQUEST_TOPIC || 'request-queue';
const DEAD_LETTER_TOPIC = process.env.KAFKA_DEAD_LETTER_TOPIC || 'request-queue-dlq';
const WORKER_GROUP = process.env.KAFKA_WORKER_GROUP || 'request-workers';
const MAX_ATTEMPTS = Number(process.env.KAFKA_MAX_ATTEMPTS || 3);

interface HandlerResult {
  statusCode: number;
  body: unknown;
}

/**
 * Sleeps for the provided number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Computes exponential retry backoff with a small upper bound.
 */
export function retryBackoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

/**
 * Ensures the Kafka topics needed for request queueing exist.
 */
export async function ensureKafkaTopics(kafka: Kafka): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: REQUEST_TOPIC,
          numPartitions: Number(process.env.KAFKA_REQUEST_TOPIC_PARTITIONS || 6),
          replicationFactor: Number(process.env.KAFKA_REQUEST_TOPIC_REPLICATION_FACTOR || 3),
        },
        {
          topic: DEAD_LETTER_TOPIC,
          numPartitions: Number(process.env.KAFKA_DLQ_TOPIC_PARTITIONS || 3),
          replicationFactor: Number(process.env.KAFKA_REQUEST_TOPIC_REPLICATION_FACTOR || 3),
        },
      ],
    });
  } finally {
    await admin.disconnect();
  }
}

/**
 * Builds minimal Express request/response shims for DB proxy handlers.
 */
export async function runDbProxyHandler(job: QueuedWriteRequest): Promise<HandlerResult> {
  let statusCode = 200;
  let body: unknown;

  const req = {
    method: job.method,
    originalUrl: job.path,
    path: job.path,
    params: job.params,
    query: job.query,
    body: job.body,
    user: job.user,
  } as unknown as Request;

  const result = new Promise<HandlerResult>((resolve) => {
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        resolve({ statusCode, body });
        return this;
      },
      send(payload: unknown) {
        body = payload;
        resolve({ statusCode, body });
        return this;
      },
    } as unknown as Response;

    const handler = job.path.includes('/upsert')
      ? dbProxyUpsert
      : job.method === 'POST'
        ? dbProxyPost
        : job.method === 'PUT' || job.method === 'PATCH'
          ? dbProxyPut
          : dbProxyDelete;

    Promise.resolve(handler(req, res)).catch((error) => {
      statusCode = 500;
      body = { error: error instanceof Error ? error.message : String(error) };
      resolve({ statusCode, body });
    });
  });

  return result;
}

/**
 * Processes one queued write and throws when the underlying write fails.
 */
export async function processQueuedWrite(job: QueuedWriteRequest): Promise<HandlerResult> {
  const result = await runDbProxyHandler(job);
  if (result.statusCode >= 400) {
    throw new Error(`Queued write failed with HTTP ${result.statusCode}: ${JSON.stringify(result.body)}`);
  }
  return result;
}

/**
 * Publishes a failed message either back to the queue or to the dead-letter topic.
 */
export async function publishRetryOrDeadLetter(producer: Producer, job: QueuedWriteRequest, error: unknown): Promise<void> {
  const nextAttempt = (job.attempt || 0) + 1;
  const failedJob = {
    ...job,
    attempt: nextAttempt,
    lastError: error instanceof Error ? error.message : String(error),
  };

  if (nextAttempt >= MAX_ATTEMPTS) {
    await producer.send({
      topic: DEAD_LETTER_TOPIC,
      messages: [{ key: job.id, value: JSON.stringify(failedJob) }],
    });
    return;
  }

  await delay(retryBackoffMs(nextAttempt));
  await producer.send({
    topic: REQUEST_TOPIC,
    messages: [{ key: job.user.id || job.table || job.id, value: JSON.stringify(failedJob) }],
  });
}

/**
 * Starts the Kafka consumer group that executes queued DB writes.
 */
export async function startKafkaRequestConsumer(): Promise<{ consumer: Consumer; producer: Producer }> {
  const kafka = createKafkaClient();
  await ensureKafkaTopics(kafka);

  const consumer = kafka.consumer({ groupId: WORKER_GROUP });
  const producer = kafka.producer();
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: REQUEST_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const job = JSON.parse(message.value.toString()) as QueuedWriteRequest;
      try {
        await processQueuedWrite(job);
      } catch (error) {
        console.error('[KafkaRequestConsumer] write failed:', error);
        await publishRetryOrDeadLetter(producer, job, error);
      }
    },
  });

  return { consumer, producer };
}

if (require.main === module) {
  startKafkaRequestConsumer().catch((error) => {
    console.error('[KafkaRequestConsumer] fatal startup error:', error);
    process.exit(1);
  });
}
