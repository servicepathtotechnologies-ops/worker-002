import { NextFunction, Request, Response } from 'express';
import client from 'prom-client';
import { getPoolStats } from '../core/database/db-pool';

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'ctrlchecks_' });

const httpRequests = new client.Counter({
  name: 'ctrlchecks_http_requests_total',
  help: 'Total HTTP requests handled by the worker.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

const httpDuration = new client.Histogram({
  name: 'ctrlchecks_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

const dbPoolUtilization = new client.Gauge({
  name: 'ctrlchecks_db_pool_utilization_percent',
  help: 'PostgreSQL pool utilization percentage.',
  registers: [register],
});

const dbPoolWaiting = new client.Gauge({
  name: 'ctrlchecks_db_pool_waiting_connections',
  help: 'PostgreSQL pool waiting connection count.',
  registers: [register],
});

export const kafkaQueueDepth = new client.Gauge({
  name: 'ctrlchecks_kafka_request_queue_depth',
  help: 'Estimated request-queue depth reported by workers.',
  registers: [register],
});

/**
 * Normalizes high-cardinality URLs into a bounded route label for Prometheus.
 */
export function routeLabel(req: Request): string {
  return req.route?.path ? String(req.baseUrl || '') + String(req.route.path) : req.path;
}

/**
 * Records request count and duration metrics after the response is sent.
 */
export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status: String(res.statusCode),
    };
    httpRequests.inc(labels);
    end(labels);
  });
  next();
}

/**
 * Renders all collected metrics in Prometheus exposition format.
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  const pool = getPoolStats();
  dbPoolUtilization.set(pool.utilization);
  dbPoolWaiting.set(pool.waitingCount);
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
}

/**
 * Updates the exported queue-depth gauge from Kafka workers or queue probes.
 */
export function setKafkaQueueDepth(depth: number): void {
  kafkaQueueDepth.set(Math.max(0, depth));
}
