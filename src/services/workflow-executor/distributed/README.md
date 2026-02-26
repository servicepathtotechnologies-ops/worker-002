# Distributed Workflow Execution System

A production-grade distributed workflow execution system with Redis queue and worker pool architecture.

## Architecture

### Components

1. **RedisQueueManager** - Manages workflow execution queue using Redis
2. **ExecutionStateStore** - Persistent storage for execution state
3. **DistributedExecutionEngine** - Main orchestrator for workflow execution
4. **StatelessWorker** - Stateless workers that process tasks from queue

### Features

- ✅ **Queue-based execution** - Redis-backed priority queue
- ✅ **Stateless workers** - No in-memory state, fully scalable
- ✅ **Workflow task scheduling** - Support for delayed execution
- ✅ **Retryable jobs** - Automatic retry with exponential backoff
- ✅ **Persistent execution state** - Redis-backed state storage
- ✅ **Horizontal scaling** - Add/remove workers dynamically

## Usage

### Initialize Engine

```typescript
import { getDistributedExecutionEngine } from './distributed-execution-engine';

const engine = getDistributedExecutionEngine();
await engine.initialize('redis://localhost:6379');
```

### Execute Workflow

```typescript
const executionId = await engine.executeWorkflow(workflow, input, {
  priority: 10,
  maxRetries: 3,
  retryDelay: 5000,
  metadata: { userId: 'user123' }
});
```

### Get Execution Status

```typescript
const status = await engine.getExecutionStatus(executionId);
console.log(`Status: ${status.status}, Completed: ${status.completedNodes.length}`);
```

### Start Worker

```typescript
import { StatelessWorker } from './stateless-worker';

const worker = new StatelessWorker({
  workerId: 'worker-1',
  nodeTypes: ['google_sheets', 'gmail'], // Optional: specific node types
  maxConcurrent: 5,
  pollInterval: 1000
});

await worker.initialize('redis://localhost:6379');
await worker.start();
```

## Queue Management

### Priority Queue

Jobs are enqueued with priority scores. Higher priority jobs are processed first.

```typescript
await queueManager.enqueue({
  id: 'job-1',
  workflowId: 'workflow-1',
  executionId: 'exec-1',
  nodeId: 'node-1',
  nodeType: 'google_sheets',
  input: {},
  priority: 10, // Higher = first
  maxRetries: 3,
  retryCount: 0,
  retryDelay: 5000,
  createdAt: Date.now(),
  status: 'pending'
});
```

### Scheduled Jobs

Jobs can be scheduled for future execution:

```typescript
await queueManager.schedule(job, 60000); // Execute in 60 seconds
```

### Retry Management

Failed jobs are automatically retried:

```typescript
await queueManager.retryJob(jobId, 5000); // Retry after 5 seconds
```

## State Management

### Execution State

Execution state is persisted in Redis:

```typescript
const state: ExecutionState = {
  executionId: 'exec-1',
  workflowId: 'workflow-1',
  status: 'running',
  currentNodeId: 'node-2',
  completedNodes: ['node-1'],
  failedNodes: [],
  nodeResults: { 'node-1': { data: '...' } },
  nodeErrors: {},
  input: {},
  startedAt: Date.now(),
  checkpoints: []
};

await stateStore.saveState(state);
```

### Checkpoints

Save checkpoints for recovery:

```typescript
await stateStore.saveCheckpoint(executionId, nodeId, {
  input: {},
  output: {},
  timestamp: Date.now()
});
```

## Worker Pool

### Stateless Design

Workers are stateless - all state is stored in Redis. This enables:
- Horizontal scaling (add/remove workers)
- Fault tolerance (workers can crash and restart)
- Load balancing (multiple workers process same queue)

### Worker Configuration

```typescript
const worker = new StatelessWorker({
  workerId: 'worker-1',
  nodeTypes: ['google_sheets', 'gmail'], // Process specific node types
  maxConcurrent: 5, // Max concurrent tasks
  pollInterval: 1000 // Poll every 1 second
});
```

### Worker Metrics

```typescript
const metrics = worker.getMetrics();
console.log(`Processed: ${metrics.processed}, Failed: ${metrics.failed}`);
```

## Scaling

### Horizontal Scaling

1. **Add Workers**: Start multiple worker instances
   ```bash
   # Worker 1
   node worker.js --worker-id=worker-1
   
   # Worker 2
   node worker.js --worker-id=worker-2
   ```

2. **Load Balancing**: All workers consume from same queue
   - Redis queue automatically distributes jobs
   - Workers process jobs in priority order

3. **Node Type Specialization**: Workers can specialize on node types
   ```typescript
   // AI worker
   const aiWorker = new StatelessWorker({
     workerId: 'ai-worker',
     nodeTypes: ['ollama', 'openai_gpt', 'ai_agent']
   });
   
   // Integration worker
   const integrationWorker = new StatelessWorker({
     workerId: 'integration-worker',
     nodeTypes: ['google_sheets', 'gmail', 'slack']
   });
   ```

## Redis Configuration

### Environment Variables

```bash
REDIS_URL=redis://localhost:6379
```

### Redis Keys

- `workflow:queue:pending` - Priority queue (sorted set)
- `workflow:queue:scheduled` - Scheduled jobs (sorted set)
- `workflow:queue:processing` - Currently processing jobs (set)
- `workflow:job:*` - Job data (strings, 24h TTL)
- `workflow:execution:state:*` - Execution state (strings, 7d TTL)
- `workflow:execution:checkpoint:*` - Checkpoints (strings, 7d TTL)

## Error Handling

### Retry Policy

- **Max Retries**: Configurable per job (default: 3)
- **Retry Delay**: Configurable per job (default: 5000ms)
- **Exponential Backoff**: Supported via retry delay

### Failure Recovery

1. **Node Failure**: Job is retried automatically
2. **Worker Failure**: Job returns to queue (via timeout)
3. **State Recovery**: Execution state persists in Redis

## Monitoring

### Queue Statistics

```typescript
const stats = await queueManager.getStats();
console.log(`Pending: ${stats.pending}, Running: ${stats.running}`);
```

### Worker Metrics

```typescript
const metrics = worker.getMetrics();
console.log(`Uptime: ${metrics.uptime}ms, Processed: ${metrics.processed}`);
```

## Best Practices

1. **Worker Pool Size**: Match to available CPU cores
2. **Poll Interval**: Balance between latency and CPU usage
3. **Priority Levels**: Use priorities for critical workflows
4. **Retry Strategy**: Set appropriate max retries and delays
5. **State Cleanup**: Implement TTL for old execution states

## Example: Complete Workflow Execution

```typescript
// 1. Initialize engine
const engine = getDistributedExecutionEngine();
await engine.initialize();

// 2. Start workers
const worker1 = new StatelessWorker({ workerId: 'worker-1' });
await worker1.initialize();
await worker1.start();

const worker2 = new StatelessWorker({ workerId: 'worker-2' });
await worker2.initialize();
await worker2.start();

// 3. Execute workflow
const executionId = await engine.executeWorkflow(workflow, input);

// 4. Monitor execution
const status = await engine.getExecutionStatus(executionId);
console.log(`Status: ${status.status}`);

// 5. Get result
const result = await engine.getExecutionResult(executionId);
console.log(`Success: ${result.success}, Output: ${result.output}`);
```

## Architecture Diagram

```
┌─────────────────┐
│  Workflow API   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ DistributedExecution    │
│ Engine                  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Redis Queue Manager   │
│   (Priority Queue)       │
└────────┬────────────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Worker 1│ │Worker 2│ │Worker 3│ │Worker N│
│(Stateless)│(Stateless)│(Stateless)│(Stateless)│
└────────┘ └────────┘ └────────┘ └────────┘
    │         │        │        │
    └─────────┴────────┴────────┘
         │
         ▼
┌─────────────────────────┐
│  Execution State Store   │
│      (Redis)             │
└─────────────────────────┘
```
