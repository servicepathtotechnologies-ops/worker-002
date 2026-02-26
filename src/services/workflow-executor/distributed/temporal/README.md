# Temporal-Style Workflow Engine

A comprehensive workflow execution engine inspired by Temporal.io with state machine, event sourcing, deterministic replay, resume from failure, step-level checkpoints, and persistent state storage.

## Features

### 1. Workflow State Machine
- **State Management**: CREATED → RUNNING → COMPLETED/FAILED/PAUSED/CANCELLED
- **State Transitions**: Enforced valid transitions only
- **State History**: Complete transition history
- **Resume Support**: Resume from FAILED, PAUSED, or TIMED_OUT states

### 2. Event Sourcing Execution History
- **Complete History**: All execution events stored
- **Event Versioning**: Sequential versioning for deterministic replay
- **Event Types**: WORKFLOW_STARTED, NODE_STARTED, NODE_COMPLETED, NODE_FAILED, CHECKPOINT_CREATED, etc.
- **Event Querying**: Query events by type, version range, or execution

### 3. Deterministic Replay
- **Full Replay**: Replay entire execution from events
- **Partial Replay**: Replay from specific version range
- **State Reconstruction**: Reconstruct execution state from events
- **Replay Validation**: Validate event ordering and completeness

### 4. Resume from Failure
- **Checkpoint-Based Resume**: Resume from latest checkpoint
- **State Restoration**: Restore complete execution state
- **Continue Execution**: Continue from last completed node
- **Automatic Recovery**: Automatic resume on failure

### 5. Step-Level Checkpoints
- **Checkpoint Creation**: Create checkpoints at each step/node
- **Checkpoint Versioning**: Sequential checkpoint versions
- **State Snapshot**: Complete state snapshot at checkpoint
- **Checkpoint Querying**: Query checkpoints by node or execution

### 6. Persistent State Storage
- **Redis-Backed**: All state stored in Redis
- **30-Day TTL**: State retained for 30 days
- **Fast Access**: O(1) state retrieval
- **Distributed**: Shared state across workers

## Architecture

```
┌─────────────────────────┐
│ TemporalWorkflowEngine  │
└───────────┬─────────────┘
            │
    ┌───────┴────────┬──────────────┬──────────────┐
    ▼                ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  State   │  │  Event   │  │Checkpoint│  │  Replay  │
│ Machine  │  │  Store   │  │ Manager  │  │  Engine  │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
    │              │              │              │
    └──────────────┴──────────────┴──────────────┘
                    │
                    ▼
            ┌───────────────┐
            │     Redis     │
            └───────────────┘
```

## Usage

### Initialize Engine

```typescript
import { getTemporalWorkflowEngine } from './temporal/temporal-workflow-engine';

const engine = getTemporalWorkflowEngine();
await engine.initialize('redis://localhost:6379');
```

### Execute Workflow

```typescript
const result = await engine.executeWorkflow(workflow, {
  input: { sheetId: '...' },
  timeout: 300000,
  maxRetries: 3,
  enableCheckpoints: true,
  checkpointInterval: 1, // Checkpoint after each node
  metadata: { userId: 'user123' },
});

console.log(`Execution ${result.executionId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
console.log(`Events: ${result.eventsCount}, Checkpoints: ${result.checkpointsCount}`);
```

### Resume from Failure

```typescript
const resumeResult = await engine.resumeFromFailure(executionId);
console.log(`Resumed execution: ${resumeResult.success}`);
```

### Replay Execution

```typescript
const replayResult = await engine.replayExecution(executionId);
console.log(`Replayed ${replayResult.eventsReplayed} events`);
console.log(`Final state:`, replayResult.finalState);
```

### Get Execution State

```typescript
const stateMachine = await engine.getExecutionState(executionId);
console.log(`Current state: ${stateMachine.currentState}`);
console.log(`Transitions: ${stateMachine.transitions.length}`);
```

### Get Execution Events

```typescript
const events = await engine.getExecutionEvents(executionId);
console.log(`Total events: ${events.length}`);

// Filter by type
const nodeEvents = events.filter(e => e.type === EventType.NODE_COMPLETED);
```

### Get Execution Checkpoints

```typescript
const checkpoints = await engine.getExecutionCheckpoints(executionId);
console.log(`Total checkpoints: ${checkpoints.length}`);

// Get latest checkpoint
const latest = checkpoints.sort((a, b) => b.version - a.version)[0];
```

## State Machine

### States

- **CREATED**: Workflow created, not yet started
- **RUNNING**: Workflow execution in progress
- **COMPLETED**: Workflow completed successfully
- **FAILED**: Workflow execution failed
- **PAUSED**: Workflow execution paused
- **CANCELLED**: Workflow execution cancelled
- **TIMED_OUT**: Workflow execution timed out

### State Transitions

```
CREATED → RUNNING → COMPLETED
       ↓
    CANCELLED

RUNNING → FAILED → RUNNING (retry)
       ↓
    PAUSED → RUNNING (resume)
       ↓
    CANCELLED
       ↓
    TIMED_OUT → RUNNING (retry)
```

### Transition Rules

- **CREATED** can transition to: RUNNING, CANCELLED
- **RUNNING** can transition to: COMPLETED, FAILED, PAUSED, CANCELLED, TIMED_OUT
- **FAILED** can transition to: RUNNING (retry), CANCELLED
- **PAUSED** can transition to: RUNNING (resume), CANCELLED
- **COMPLETED** is terminal (no transitions)
- **CANCELLED** is terminal (no transitions)

## Event Sourcing

### Event Types

- **WORKFLOW_STARTED**: Workflow execution started
- **WORKFLOW_COMPLETED**: Workflow execution completed
- **WORKFLOW_FAILED**: Workflow execution failed
- **NODE_STARTED**: Node execution started
- **NODE_COMPLETED**: Node execution completed
- **NODE_FAILED**: Node execution failed
- **CHECKPOINT_CREATED**: Checkpoint created
- **STATE_TRANSITION**: State machine transition
- **RETRY_ATTEMPTED**: Retry attempted
- **TIMEOUT**: Operation timed out

### Event Structure

```typescript
{
  id: 'exec-1:1',
  executionId: 'exec-1',
  workflowId: 'workflow-1',
  type: EventType.NODE_COMPLETED,
  timestamp: 1234567890,
  version: 1,
  data: {
    nodeId: 'node-1',
    nodeType: 'google_sheets',
    result: { ... },
  },
  metadata: { ... },
}
```

### Event Querying

```typescript
// Get all events
const allEvents = await eventStore.getExecutionEvents(executionId);

// Get events by type
const nodeEvents = await eventStore.getEventsByType(executionId, EventType.NODE_COMPLETED);

// Get events in version range
const rangeEvents = await eventStore.getEventsInRange(executionId, 1, 10);
```

## Checkpoints

### Checkpoint Structure

```typescript
{
  id: 'exec-1:node-1:1',
  executionId: 'exec-1',
  workflowId: 'workflow-1',
  nodeId: 'node-1',
  nodeType: 'google_sheets',
  version: 1,
  timestamp: 1234567890,
  state: {
    input: { ... },
    output: { ... },
    nodeResults: { ... },
    completedNodes: ['node-1'],
    failedNodes: [],
    currentNodeId: 'node-1',
  },
}
```

### Checkpoint Creation

Checkpoints are automatically created:
- After each node (if `checkpointInterval: 1`)
- After N nodes (if `checkpointInterval: N`)
- On failure (for resume support)

### Resume from Checkpoint

```typescript
const checkpoint = await checkpointManager.getLatestCheckpoint(executionId);
// Resume execution from checkpoint state
```

## Deterministic Replay

### Full Replay

```typescript
const replayResult = await replayEngine.replay(executionId);
// Reconstructs complete execution state from events
```

### Partial Replay

```typescript
const replayResult = await replayEngine.replay(executionId, 1, 10);
// Replays events from version 1 to 10
```

### Replay from Checkpoint

```typescript
const replayResult = await replayEngine.replayFromCheckpoint(executionId, checkpointId);
// Replays events after checkpoint
```

## Resume from Failure

### Automatic Resume

```typescript
// Workflow fails
const result = await engine.executeWorkflow(workflow, options);
if (!result.success) {
  // Resume from latest checkpoint
  const resumeResult = await engine.resumeFromFailure(result.executionId);
}
```

### Manual Resume

```typescript
// Get failed execution
const stateMachine = await engine.getExecutionState(executionId);
if (stateMachine.currentState === WorkflowState.FAILED) {
  // Resume execution
  const resumeResult = await engine.resumeFromFailure(executionId);
}
```

## Best Practices

1. **Checkpoint Frequency**: Balance between recovery time and storage
   - `checkpointInterval: 1` - Checkpoint after each node (best recovery, more storage)
   - `checkpointInterval: 5` - Checkpoint every 5 nodes (balanced)

2. **Event Retention**: Events retained for 30 days (configurable TTL)

3. **State Machine**: Always use state machine for state transitions

4. **Replay Testing**: Use replay to test workflow logic deterministically

5. **Resume Strategy**: Always resume from latest checkpoint on failure

## Example: Complete Workflow Execution

```typescript
// 1. Initialize engine
const engine = getTemporalWorkflowEngine();
await engine.initialize();

// 2. Execute workflow
const result = await engine.executeWorkflow(workflow, {
  input: { data: '...' },
  enableCheckpoints: true,
  checkpointInterval: 1,
});

// 3. Check result
if (!result.success) {
  // Resume from failure
  const resumeResult = await engine.resumeFromFailure(result.executionId);
}

// 4. Replay execution
const replayResult = await engine.replayExecution(result.executionId);
console.log(`Replayed ${replayResult.eventsReplayed} events`);

// 5. Get execution history
const events = await engine.getExecutionEvents(result.executionId);
const checkpoints = await engine.getExecutionCheckpoints(result.executionId);
```

## Integration with Distributed Execution

The TemporalWorkflowEngine can be integrated with the distributed execution system:

```typescript
// Use Temporal engine for state management
const temporalEngine = getTemporalWorkflowEngine();
await temporalEngine.initialize();

// Use distributed engine for actual execution
const distributedEngine = getDistributedExecutionEngine();
await distributedEngine.initialize();

// Execute with both
const executionId = await temporalEngine.executeWorkflow(workflow, options);
// Distributed engine handles actual node execution
```
