import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceparent: string;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

function randomHex(size: number): string {
  return randomUUID().replace(/-/g, '').slice(0, size).padEnd(size, '0');
}

function parseTraceparent(traceparent?: string): TraceContext | null {
  if (!traceparent) return null;
  const parts = traceparent.split('-');
  if (parts.length !== 4) return null;
  const [, traceId, parentSpanId] = parts;
  if (traceId.length !== 32 || parentSpanId.length !== 16) return null;
  const spanId = randomHex(16);
  return {
    traceId,
    spanId,
    parentSpanId,
    traceparent: `00-${traceId}-${spanId}-01`,
  };
}

export function createTraceContext(traceparentHeader?: string, fallbackTraceId?: string): TraceContext {
  const parsed = parseTraceparent(traceparentHeader);
  if (parsed) return parsed;
  const traceId = fallbackTraceId || randomHex(32);
  const spanId = randomHex(16);
  return {
    traceId,
    spanId,
    traceparent: `00-${traceId}-${spanId}-01`,
  };
}

export function getCurrentTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

export function runWithTraceContext<T>(context: TraceContext, fn: () => T): T {
  return traceStorage.run(context, fn);
}

export function createChildTraceContext(parent: TraceContext): TraceContext {
  const spanId = randomHex(16);
  return {
    traceId: parent.traceId,
    parentSpanId: parent.spanId,
    spanId,
    traceparent: `00-${parent.traceId}-${spanId}-01`,
  };
}

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingTraceparent = req.get('traceparent') || undefined;
  const incomingTraceId = req.get('x-trace-id') || undefined;
  const context = createTraceContext(incomingTraceparent, incomingTraceId);

  res.setHeader('x-trace-id', context.traceId);
  res.setHeader('traceparent', context.traceparent);

  runWithTraceContext(context, () => {
    const anyReq = req as any;
    anyReq.traceContext = context;
    next();
  });
}
