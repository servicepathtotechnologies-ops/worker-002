import {
  createTraceContext,
  createChildTraceContext,
  runWithTraceContext,
  getCurrentTraceContext,
} from '../distributed-tracing';

describe('distributed tracing context', () => {
  it('creates a new context when no traceparent is provided', () => {
    const context = createTraceContext();
    expect(context.traceId).toHaveLength(32);
    expect(context.spanId).toHaveLength(16);
    expect(context.traceparent).toContain(context.traceId);
  });

  it('creates child context preserving trace id', () => {
    const parent = createTraceContext();
    const child = createChildTraceContext(parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).not.toBe(parent.spanId);
  });

  it('stores context in async local storage', () => {
    const context = createTraceContext();
    runWithTraceContext(context, () => {
      const current = getCurrentTraceContext();
      expect(current?.traceId).toBe(context.traceId);
    });
  });
});
