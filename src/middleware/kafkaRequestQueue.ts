import { NextFunction, Request, Response } from 'express';
import { Kafka, Producer } from 'kafkajs';

export interface QueuedWriteRequest {
  id: string;
  method: string;
  path: string;
  table?: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  user: { id?: string; role?: string };
  attempt: number;
  createdAt: string;
}

let producer: Producer | null = null;
let producerConnecting: Promise<Producer | null> | null = null;

/**
 * Creates a Kafka client using environment-driven broker configuration.
 */
export function createKafkaClient(): Kafka {
  const brokers = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',').map((broker) => broker.trim()).filter(Boolean);
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'ctrlchecks-api',
    brokers,
  });
}

/**
 * Returns a singleton Kafka producer for API write queueing.
 */
export async function getKafkaProducer(): Promise<Producer | null> {
  if (producer) return producer;
  if (producerConnecting) return producerConnecting;

  producerConnecting = (async () => {
    try {
      const nextProducer = createKafkaClient().producer();
      await nextProducer.connect();
      producer = nextProducer;
      return nextProducer;
    } catch (error) {
      console.error('[KafkaRequestQueue] producer unavailable:', error);
      producer = null;
      return null;
    } finally {
      producerConnecting = null;
    }
  })();

  return producerConnecting;
}

/**
 * Builds the durable write-job payload sent to Kafka.
 */
export function buildQueuedWriteRequest(req: Request): QueuedWriteRequest {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
    method: req.method,
    path: req.originalUrl,
    table: req.params.table,
    params: { ...req.params },
    query: { ...req.query },
    body: req.body,
    user: {
      id: (req as any).user?.id,
      role: (req as any).user?.role,
    },
    attempt: 0,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Publishes write requests to Kafka and returns an accepted response.
 */
export function kafkaWriteQueueMiddleware(topic = process.env.KAFKA_REQUEST_TOPIC || 'request-queue') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env.QUEUE_WRITES_ENABLED !== 'true') return next();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    const kafkaProducer = await getKafkaProducer();
    if (!kafkaProducer) {
      res.status(503).json({ error: 'Write queue unavailable', code: 'KAFKA_UNAVAILABLE' });
      return;
    }

    const message = buildQueuedWriteRequest(req);
    await kafkaProducer.send({
      topic,
      messages: [{
        key: message.user.id || message.table || message.id,
        value: JSON.stringify(message),
        headers: { operation: req.method, path: req.path },
      }],
    });

    res.status(202).json({
      accepted: true,
      queued: true,
      requestId: message.id,
      topic,
    });
  };
}
