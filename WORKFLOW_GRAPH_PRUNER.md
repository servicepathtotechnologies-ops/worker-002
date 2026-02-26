# Workflow Graph Pruner

## Overview

The `WorkflowGraphPruner` prunes workflow graphs to minimal DAG after workflow builder and repair phase.

## Behavior

1. ✅ **Remove nodes not required by intent**
2. ✅ **Remove loops if no iteration intent detected**
3. ✅ **Remove duplicate processing nodes**
4. ✅ **Remove disconnected nodes**
5. ✅ **Ensure single path from trigger to output**
6. ✅ **Keep minimal DAG**

## When to Run

**Run this after workflow builder and repair phase.**

## API

### Function: `pruneWorkflowGraph(workflow, intent) → PruningResult`

```typescript
import { pruneWorkflowGraph } from './workflow-graph-pruner';
import { Workflow } from '../../core/types/ai-types';
import { StructuredIntent } from './intent-structurer';

const workflow: Workflow = {
  nodes: [...],
  edges: [...],
};

const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const result = pruneWorkflowGraph(workflow, intent);
// Returns: { workflow, removedNodes, removedEdges, statistics, violations }
```

### Class: `WorkflowGraphPruner`

```typescript
import { WorkflowGraphPruner } from './workflow-graph-pruner';

const pruner = new WorkflowGraphPruner();
const result = pruner.prune(workflow, intent);
```

## Pruning Steps

### Step 1: Remove Nodes Not Required by Intent

Uses `IntentConstraintEngine` to determine required nodes:
- Keeps nodes whose types match required types
- Keeps trigger nodes (always required)
- Removes nodes not in required set

### Step 2: Remove Loops If No Iteration Intent

Checks intent for loop keywords:
- Keywords: `loop`, `iterate`, `repeat`, `for each`, `foreach`, `each`
- If no loop intent detected, removes all loop nodes

### Step 3: Remove Duplicate Processing Nodes

Keeps only the first occurrence of each processing node type:
- Processing types: `transform`, `set_variable`, `format`, `parse`, `filter`, `map`, `reduce`
- AI types: `text_summarizer`, `ollama`, `openai_gpt`, `anthropic_claude`, `google_gemini`
- Removes subsequent duplicates

### Step 4: Remove Disconnected Nodes

Removes nodes not reachable from trigger:
- Uses BFS from trigger to find all reachable nodes
- Removes nodes not in reachable set
- Ensures all nodes are connected to workflow

### Step 5: Ensure Single Path from Trigger → Output

Removes edges that create multiple paths:
- Finds shortest path from trigger to each output node
- Removes parallel paths
- Keeps only minimal DAG structure

### Step 6: Remove Edges Connected to Removed Nodes

Automatically removes orphaned edges:
- Removes edges where source or target node was removed
- Maintains graph integrity

## PruningResult

```typescript
interface PruningResult {
  workflow: Workflow;              // Pruned workflow graph
  removedNodes: string[];          // IDs of removed nodes
  removedEdges: string[];          // IDs of removed edges
  statistics: {
    originalNodeCount: number;     // Nodes before pruning
    prunedNodeCount: number;       // Nodes after pruning
    originalEdgeCount: number;     // Edges before pruning
    prunedEdgeCount: number;       // Edges after pruning
    disconnectedNodesRemoved: number;  // Disconnected nodes removed
    duplicateNodesRemoved: number;     // Duplicate nodes removed
    loopNodesRemoved: number;          // Loop nodes removed
  };
  violations: PruningViolation[];  // Policy violations found
}
```

## PruningViolation

```typescript
interface PruningViolation {
  type: 'unrequired_node' | 'duplicate_processing' | 'unnecessary_loop' | 'disconnected_node' | 'non_minimal_path';
  nodeId?: string;
  nodeType?: string;
  reason: string;
}
```

## Usage Examples

### Example 1: Remove Unrequired Nodes

```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "gmail", operation: "send" }
  ]
};

const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'extra', type: 'set_variable', data: {...} }, // Not required
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const result = pruneWorkflowGraph(workflow, intent);
// Removes: 'extra' node
// Result: [trigger, sheets, gmail]
```

### Example 2: Remove Loops

```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "gmail", operation: "send" }
  ]
  // No loop mentioned
};

const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'loop', type: 'loop', data: {...} }, // Not explicitly requested
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const result = pruneWorkflowGraph(workflow, intent);
// Removes: 'loop' node
// Result: [trigger, sheets, gmail]
```

### Example 3: Remove Duplicate Processing Nodes

```typescript
const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'summarizer1', type: 'text_summarizer', data: {...} },
    { id: 'summarizer2', type: 'text_summarizer', data: {...} }, // Duplicate
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const result = pruneWorkflowGraph(workflow, intent);
// Removes: 'summarizer2' node
// Result: [trigger, summarizer1, gmail]
```

### Example 4: Remove Disconnected Nodes

```typescript
const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'gmail', type: 'google_gmail', data: {...} },
    { id: 'orphan', type: 'set_variable', data: {...} }, // Not connected
  ],
  edges: [
    { id: 'e1', source: 'trigger', target: 'sheets' },
    { id: 'e2', source: 'sheets', target: 'gmail' },
    // No edge to 'orphan'
  ]
};

const result = pruneWorkflowGraph(workflow, intent);
// Removes: 'orphan' node (disconnected)
// Result: [trigger, sheets, gmail]
```

### Example 5: Ensure Single Path

```typescript
const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'summarizer', type: 'text_summarizer', data: {...} },
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [
    { id: 'e1', source: 'trigger', target: 'sheets' },
    { id: 'e2', source: 'sheets', target: 'summarizer' },
    { id: 'e3', source: 'summarizer', target: 'gmail' },
    { id: 'e4', source: 'sheets', target: 'gmail' }, // Parallel path
  ]
};

const result = pruneWorkflowGraph(workflow, intent);
// Removes: 'e4' edge (parallel path)
// Result: Single path: trigger → sheets → summarizer → gmail
```

## Integration

The `WorkflowGraphPruner` is integrated into the workflow generation pipeline:

**Location**: `workflow-pipeline-orchestrator.ts` (STEP 5.5)

**Applied After**:
- Workflow builder (STEP 3)
- Workflow repair (STEP 5)

**Applied Before**:
- Workflow normalization (STEP 6)
- Credential detection (STEP 7)

```typescript
// In workflow pipeline (STEP 5.5, after repair)
const { pruneWorkflowGraph } = await import('./workflow-graph-pruner');
const pruningResult = pruneWorkflowGraph(finalWorkflow, structuredIntent);

// Use pruned workflow
finalWorkflow = pruningResult.workflow;
```

## Differences from MinimalWorkflowPolicy

| Feature | MinimalWorkflowPolicy | WorkflowGraphPruner |
|---------|----------------------|---------------------|
| **When Applied** | During pipeline (STEP 3.2) | After repair (STEP 5.5) |
| **Purpose** | Policy enforcement | Post-processing cleanup |
| **Disconnected Nodes** | ❌ Not handled | ✅ Removed |
| **Duplicate Processing** | Only transformers | All processing nodes |
| **Focus** | Policy compliance | Graph optimization |

## Benefits

1. **Minimal DAG**: Only includes nodes required by intent
2. **Clean Graph**: Removes disconnected and duplicate nodes
3. **Single Path**: Ensures deterministic execution flow
4. **Post-Repair Cleanup**: Cleans up after repair phase
5. **Detailed Statistics**: Provides pruning metrics
