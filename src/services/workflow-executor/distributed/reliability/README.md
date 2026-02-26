# Reliability Layer

Comprehensive reliability layer for distributed workflow execution with circuit breakers, rate limiting, retries, timeouts, dead letter queue, and idempotency.

## Features

### 1. Circuit Breaker (Per Provider)
- **Failure Threshold**: Opens circuit after N consecutive failures
- **Success Threshold**: Closes circuit after N successes (half-open state)
- **Automatic Recovery**: Tests provider recovery in half-open state
- **State Management**: CLOSED → OPEN → HALF_OPEN → CLOSED

### 2. Rate Limit Protection
- **Token Bucket Algorithm**: Sliding window rate limiting
- **Per-Provider Limits**: Configure limits per provider
- **Burst Support**: Allow burst of requests
- **Redis-Backed**: Distributed rate limiting across workers

### 3. Retry with Exponential Backoff
- **Exponential Backoff**: Delay = initialDelay * (multiplier ^ attempt)
- **Jitter**: Random jitter to prevent thundering herd
- **Configurable Strategies**: Exponential, linear, or fixed delay
- **Max Retries**: Configurable per operation

### 4. Timeout Handling
- **Per-Operation Timeouts**: Configurable timeout per operation
- **Automatic Cancellation**: Operations cancelled on timeout
- **Timeout Callbacks**: Execute cleanup on timeout

### 5. Dead Letter Queue
- **Persistent Storage**: Failed jobs stored in Redis
- **Failure Reasons**: Track why jobs failed (max_retries, circuit_open, timeout, rate_limit)
- **Query Support**: Query jobs by reason or time
- **Replay Support**: Replay failed jobs manually

### 6. Idempotent Workflow Execution
- **Idempotency Keys**: Deterministic keys from workflow ID + input
- **Result Caching**: Cache results for duplicate requests
- **Automatic Deduplication**: Detect and return cached results
- **TTL Support**: Configurable cache expiration

## Usage

### Initialize Reliability Layer

```typescript
import { getReliabilityLayer } from './reliability/reliability-layer';

const reliabilityLayer = getReliabilityLayer();
await reliabilityLayer.initialize('redis://localhost:6379');
```

### Configure Provider

```typescript
reliabilityLayer.configureProvider('google', {
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    burst: 10,
  },
});
```

### Execute with Reliability Protection

```typescript
const context: ExecutionContext = {
  executionId: 'exec-1',
  workflowId: 'workflow-1',
  nodeId: 'node-1',
  nodeType: 'google_sheets',
  provider: 'google',
  input: { sheetId: '...' },
  idempotencyKey: 'workflow-1:input-hash',
};

const result = await reliabilityLayer.execute(
  context,
  async () => {
    // Your operation
    return await executeNode(context);
  },
  {
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    },
    rateLimit: {
      maxRequests: 100,
      windowMs: 60000,
    },
    retry: {
      maxRetries: 3,
      initialDelay: 1000,
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
  }
);
```

## Circuit Breaker

### States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Circuit open, requests rejected immediately
- **HALF_OPEN**: Testing if provider recovered, limited requests allowed

### Configuration

```typescript
{
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes (half-open)
  timeout: 60000,        // Wait 1 minute before half-open
  resetTimeout: 300000,  // Reset failure count after 5 minutes
}
```

### Manual Reset

```typescript
reliabilityLayer.resetCircuitBreaker('google');
```

## Rate Limiting

### Token Bucket Algorithm

- **Max Requests**: Maximum requests per window
- **Window**: Time window in milliseconds
- **Burst**: Allow burst of N requests

### Configuration

```typescript
{
  maxRequests: 100,  // 100 requests per window
  windowMs: 60000,   // 1 minute window
  burst: 10,         // Allow burst of 10 requests
}
```

### Automatic Throttling

The rate limiter automatically waits when limits are exceeded:

```typescript
await rateLimitManager.waitForLimit('google');
// Will wait until rate limit allows request
```

## Retry Manager

### Exponential Backoff

Delay calculation:
```
delay = initialDelay * (multiplier ^ attempt)
delay = min(delay, maxDelay)
delay = delay + jitter (if enabled)
```

### Strategies

- **exponential**: `delay = initialDelay * (multiplier ^ attempt)`
- **linear**: `delay = initialDelay * (attempt + 1)`
- **fixed**: `delay = initialDelay`

### Configuration

```typescript
{
  maxRetries: 3,
  initialDelay: 1000,    // 1 second
  maxDelay: 60000,       // 60 seconds max
  multiplier: 2,         // Double each retry
  jitter: true,          // Add random jitter
  strategy: 'exponential',
}
```

## Timeout Handler

### Per-Operation Timeout

```typescript
const result = await timeoutHandler.execute(
  async () => {
    return await longRunningOperation();
  },
  {
    timeout: 300000, // 5 minutes
    onTimeout: () => {
      console.log('Operation timed out');
    },
  }
);
```

## Dead Letter Queue

### Add Failed Job

```typescript
await deadLetterQueue.addJob(job, error, 'max_retries');
```

### Query Jobs

```typescript
// Get all jobs
const allJobs = await deadLetterQueue.getAllJobs(100);

// Get jobs by reason
const maxRetryJobs = await deadLetterQueue.getJobsByReason('max_retries', 100);

// Get statistics
const stats = await deadLetterQueue.getStats();
console.log(`Total: ${stats.total}, By reason: ${stats.byReason}`);
```

### Failure Reasons

- **max_retries**: Exceeded maximum retry attempts
- **circuit_open**: Circuit breaker is open
- **timeout**: Operation timed out
- **rate_limit**: Rate limit exceeded
- **unknown**: Unknown error

## Idempotency Manager

### Generate Key

```typescript
const key = idempotencyManager.generateKey(workflowId, input);
// Returns: "workflow-1:abc123def456"
```

### Check Idempotency

```typescript
const check = await idempotencyManager.checkIdempotency(
  key,
  executionId,
  workflowId,
  input
);

if (check.isDuplicate) {
  return check.cachedResult; // Return cached result
}
```

### Store Result

```typescript
await idempotencyManager.storeResult(
  key,
  executionId,
  workflowId,
  input,
  result
);
```

## Integration with StatelessWorker

The ReliabilityLayer is automatically integrated into StatelessWorker:

```typescript
const worker = new StatelessWorker({ workerId: 'worker-1' });
await worker.initialize('redis://localhost:6379');
await worker.start();

// All node executions are automatically protected by:
// - Circuit breaker
// - Rate limiting
// - Retry with exponential backoff
// - Timeout handling
// - Dead letter queue
// - Idempotency
```

## Monitoring

### Circuit Breaker Stats

```typescript
const stats = reliabilityLayer.getCircuitBreakerStats();
stats.forEach(stat => {
  console.log(`${stat.provider}: ${stat.state}, Failures: ${stat.failures}`);
});
```

### Dead Letter Queue Stats

```typescript
const dlqStats = await reliabilityLayer.getDeadLetterQueueStats();
console.log(`Total DLQ jobs: ${dlqStats.total}`);
console.log(`By reason:`, dlqStats.byReason);
```

## Best Practices

1. **Circuit Breaker**: Set appropriate thresholds based on provider reliability
2. **Rate Limiting**: Configure limits based on provider API limits
3. **Retry Strategy**: Use exponential backoff for network errors
4. **Timeout**: Set timeouts based on expected operation duration
5. **Idempotency**: Always enable for critical operations
6. **Dead Letter Queue**: Monitor DLQ regularly for failed jobs

## Architecture

```
┌─────────────────────┐
│  StatelessWorker    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ ReliabilityLayer    │
└──────────┬──────────┘
           │
    ┌──────┴──────┬──────────┬──────────┬──────────┐
    ▼             ▼          ▼          ▼          ▼
┌──────────┐ ┌─────────┐ ┌──────┐ ┌────────┐ ┌──────────┐
│ Circuit  │ │ Rate    │ │Retry │ │Timeout │ │Idempotent│
│ Breaker  │ │ Limiter │ │Manager│ │Handler │ │ Manager  │
└──────────┘ └─────────┘ └──────┘ └────────┘ └──────────┘
    │             │          │         │            │
    └─────────────┴──────────┴─────────┴────────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Dead Letter   │
            │ Queue          │
            └───────────────┘
```

## Example: Complete Execution Flow

```typescript
// 1. Initialize reliability layer
const reliabilityLayer = getReliabilityLayer();
await reliabilityLayer.initialize();

// 2. Configure providers
reliabilityLayer.configureProvider('google', {
  rateLimit: { maxRequests: 100, windowMs: 60000 },
});

// 3. Execute with full protection
const result = await reliabilityLayer.execute(
  {
    executionId: 'exec-1',
    workflowId: 'workflow-1',
    nodeId: 'node-1',
    nodeType: 'google_sheets',
    provider: 'google',
    input: { sheetId: '...' },
    idempotencyKey: 'workflow-1:hash',
  },
  async () => {
    return await executeGoogleSheetsNode(input);
  },
  {
    circuitBreaker: { failureThreshold: 5 },
    rateLimit: { maxRequests: 100, windowMs: 60000 },
    retry: { maxRetries: 3, initialDelay: 1000 },
    timeout: { timeout: 300000 },
    idempotency: { enabled: true },
  }
);

if (result.success) {
  console.log('Execution successful:', result.result);
} else {
  console.error('Execution failed:', result.error);
}
```
