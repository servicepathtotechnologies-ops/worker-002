# Graph Connectivity Builder - Implementation Guide

## Overview

The `GraphConnectivityBuilder` ensures deterministic graph connectivity **BEFORE** validation runs. This prevents workflow validation failures by guaranteeing:

1. ✅ Exactly one trigger (auto-created if missing)
2. ✅ All nodes reachable from trigger
3. ✅ Deterministic execution plan from intent
4. ✅ No orphan nodes

## Architecture

### Pipeline Flow

```
1. Generate Nodes (from intent)
   ↓
2. Build Execution Plan (from StructuredIntent)
   ↓
3. Build Edges (deterministically from plan)
   ↓
4. Attach Orphan Nodes (if any)
   ↓
5. Validate Graph Integrity (internal check)
   ↓
6. GraphConnectivityValidationLayer (should always pass)
```

## Usage

### Basic Usage

```typescript
import { GraphConnectivityBuilder } from '../graph/graph-connectivity-builder';
import { StructuredIntent } from '../ai/intent-structurer';

const builder = new GraphConnectivityBuilder();

// Step 1: Build execution plan
const executionPlan = builder.buildExecutionPlan(structuredIntent, nodes);

// Step 2: Build edges from plan
let edges = builder.buildEdgesFromPlan(executionPlan);

// Step 3: Attach orphan nodes
edges = builder.attachOrphanNodes(nodes, edges, executionPlan.triggerNodeId);

// Step 4: Validate integrity
const integrity = builder.validateGraphIntegrity(nodes, edges, executionPlan.triggerNodeId);

if (!integrity.valid) {
  throw new Error(`Graph integrity failed: ${integrity.errors.join(', ')}`);
}
```

### Integration in Workflow Builder

The builder is integrated into `workflow-builder.ts` at the connection creation phase:

```typescript
// Before validation pipeline
const { GraphConnectivityBuilder } = await import('../graph/graph-connectivity-builder');
const connectivityBuilder = new GraphConnectivityBuilder();

const executionPlan = connectivityBuilder.buildExecutionPlan(structuredIntent, configuredNodes);
let connections = connectivityBuilder.buildEdgesFromPlan(executionPlan);
connections = connectivityBuilder.attachOrphanNodes(configuredNodes, connections, executionPlan.triggerNodeId);

const integrityCheck = connectivityBuilder.validateGraphIntegrity(
  configuredNodes,
  connections,
  executionPlan.triggerNodeId
);

if (!integrityCheck.valid) {
  throw new Error(`Graph connectivity failed: ${integrityCheck.errors.join(', ')}`);
}
```

## Methods

### `buildExecutionPlan(intent, nodes): ExecutionPlan`

**Purpose**: Converts structured intent into deterministic execution order.

**Parameters**:
- `intent: StructuredIntent | null` - Structured intent (can be null for fallback)
- `nodes: WorkflowNode[]` - Workflow nodes

**Returns**: `ExecutionPlan` with:
- `nodeIds: string[]` - Ordered node IDs (trigger first)
- `nodeTypes: string[]` - Corresponding node types
- `triggerNodeId: string` - ID of trigger node

**Behavior**:
- Always ensures trigger is first
- Orders nodes: trigger → dataSources → transformations → actions
- Creates trigger if missing
- Falls back to node order if intent unavailable

**Example**:
```typescript
const intent: StructuredIntent = {
  trigger: 'manual_trigger',
  actions: [
    { type: 'google_sheets', operation: 'read' },
    { type: 'slack_message', operation: 'send' },
  ],
  requires_credentials: [],
};

const plan = builder.buildExecutionPlan(intent, nodes);
// Returns: { nodeIds: [triggerId, sheetsId, slackId], ... }
```

---

### `buildEdgesFromPlan(executionPlan): WorkflowEdge[]`

**Purpose**: Creates edges deterministically from execution plan.

**Parameters**:
- `executionPlan: ExecutionPlan` - Execution plan with ordered node IDs

**Returns**: Array of `WorkflowEdge` objects

**Behavior**:
- Creates edges: `plan[i] → plan[i+1]`
- Guarantees linear connectivity
- No assumptions, purely deterministic

**Example**:
```typescript
const plan = {
  nodeIds: ['trigger-1', 'node-1', 'node-2'],
  nodeTypes: ['manual_trigger', 'google_sheets', 'slack_message'],
  triggerNodeId: 'trigger-1',
};

const edges = builder.buildEdgesFromPlan(plan);
// Returns: [
//   { source: 'trigger-1', target: 'node-1' },
//   { source: 'node-1', target: 'node-2' }
// ]
```

---

### `attachOrphanNodes(nodes, edges, triggerNodeId): WorkflowEdge[]`

**Purpose**: Attaches orphan nodes to last reachable node.

**Parameters**:
- `nodes: WorkflowNode[]` - All workflow nodes
- `edges: WorkflowEdge[]` - Existing edges
- `triggerNodeId: string` - ID of trigger node

**Returns**: Updated edges array with orphan nodes attached

**Behavior**:
- Finds nodes not reachable from trigger
- Connects them to last reachable node (furthest from trigger)
- Prevents orphan nodes

**Example**:
```typescript
// Before: trigger → node1, orphan (disconnected)
// After: trigger → node1 → orphan
const edges = builder.attachOrphanNodes(nodes, edges, triggerId);
```

---

### `validateGraphIntegrity(nodes, edges, triggerNodeId): IntegrityResult`

**Purpose**: Validates graph integrity before validation pipeline runs.

**Parameters**:
- `nodes: WorkflowNode[]` - All workflow nodes
- `edges: WorkflowEdge[]` - All workflow edges
- `triggerNodeId: string` - ID of trigger node

**Returns**: `IntegrityResult` with:
- `valid: boolean` - Overall validation result
- `errors: string[]` - Validation errors
- `warnings: string[]` - Non-blocking warnings
- `details: {...}` - Detailed statistics

**Checks**:
1. Exactly one trigger
2. All nodes reachable from trigger
3. Basic cycle detection

**Example**:
```typescript
const integrity = builder.validateGraphIntegrity(nodes, edges, triggerId);

if (!integrity.valid) {
  console.error('Graph integrity failed:', integrity.errors);
  // Should not happen - builder should guarantee connectivity
}
```

## Deterministic Behavior

### Guarantees

1. **Same Intent → Same Graph**: Identical structured intent always produces identical graph structure
2. **Trigger Always First**: Trigger is always first node in execution plan
3. **No Orphan Nodes**: All nodes are connected (orphans auto-attached)
4. **Linear Connectivity**: Edges created deterministically: `plan[i] → plan[i+1]`

### Example

**Input Intent**:
```json
{
  "trigger": "manual_trigger",
  "actions": [
    { "type": "google_sheets", "operation": "read" },
    { "type": "slack_message", "operation": "send" }
  ]
}
```

**Output Graph** (always the same):
```
trigger → google_sheets → slack_message
```

## Testing

### Unit Tests

Run tests:
```bash
npm test -- graph-connectivity-builder.test.ts
```

**Test Coverage**:
- ✅ Execution plan building
- ✅ Edge creation from plan
- ✅ Orphan node attachment
- ✅ Graph integrity validation
- ✅ End-to-end workflow

### Manual Testing

1. Create workflow with intent
2. Check execution plan order
3. Verify all edges created
4. Verify no orphan nodes
5. Verify integrity check passes

## Troubleshooting

### Issue: "No trigger found"

**Solution**: Builder auto-creates trigger. Check logs for trigger creation.

### Issue: "Orphan nodes detected"

**Solution**: Builder auto-attaches orphans. Check logs for attachment.

### Issue: "Graph integrity failed"

**Solution**: This should not happen. Builder guarantees connectivity. Check:
- Nodes array is valid
- Trigger node exists
- Execution plan is correct

## Related Files

- `worker/src/services/graph/graph-connectivity-builder.ts` - Core builder
- `worker/src/services/ai/workflow-builder.ts` - Integration point
- `worker/src/services/ai/workflow-validation-pipeline.ts` - Validation layer
- `worker/src/services/ai/ai-workflow-validator.ts` - AI validator (fixed)

## Notes

- Builder runs **BEFORE** validation pipeline
- Validation should always pass for correctly generated workflows
- Builder guarantees connectivity, validation verifies it
- If integrity check fails, it's a bug in the builder (should not happen)
