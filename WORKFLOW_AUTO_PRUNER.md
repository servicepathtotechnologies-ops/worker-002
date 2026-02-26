# Workflow Auto Pruner

## Overview

The `WorkflowAutoPruner` removes unnecessary nodes and edges to create a minimal DAG that satisfies the user's intent.

## Behavior

1. ✅ **Remove nodes not required by intent**
2. ✅ **Remove loops if no iteration intent detected**
3. ✅ **Remove duplicate transformers**
4. ✅ **Ensure single path from trigger → output**
5. ✅ **Keep minimal DAG**

## Input/Output

**Input**: `Workflow` graph (nodes + edges) + `StructuredIntent`
**Output**: Pruned `Workflow` graph with statistics

## API

### Function: `pruneWorkflow(workflow, intent) → PruningResult`

```typescript
import { pruneWorkflow } from './workflow-auto-pruner';
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

const result = pruneWorkflow(workflow, intent);
// Returns: { workflow, removedNodes, removedEdges, statistics }
```

### Class: `WorkflowAutoPruner`

```typescript
import { WorkflowAutoPruner } from './workflow-auto-pruner';

const pruner = new WorkflowAutoPruner();
const result = pruner.prune(workflow, intent);
```

## Pruning Steps

### Step 1: Remove Nodes Not Required by Intent

Uses `IntentConstraintEngine` to determine required node types:
- Keeps nodes whose types match required types
- Keeps trigger nodes (always required)
- Removes nodes not in required set

**Example:**
```typescript
// Intent requires: [google_sheets, text_summarizer, gmail]
// Workflow has: [manual_trigger, google_sheets, text_summarizer, gmail, set_variable]
// Result: Removes set_variable (not required)
```

### Step 2: Remove Loops If No Iteration Intent

Checks intent for loop keywords:
- Keywords: `loop`, `iterate`, `repeat`, `for each`, `foreach`, `each`
- If no loop intent detected, removes all loop nodes

**Example:**
```typescript
// Intent: "Get data from Sheets, summarize, send email" (no loop mentioned)
// Workflow has: [trigger, sheets, loop, summarizer, gmail]
// Result: Removes loop node
```

### Step 3: Remove Duplicate Transformers

Keeps only the first occurrence of each transformer type:
- Transformer types: `transform`, `set_variable`, `format`, `parse`, `filter`, `map`, `reduce`
- Removes subsequent duplicates

**Example:**
```typescript
// Workflow has: [trigger, sheets, transform, summarizer, transform, gmail]
// Result: Removes second transform node
```

### Step 4: Prune Edges Connected to Removed Nodes

Removes edges where source or target node was removed:
- Automatically cleans up orphaned edges
- Maintains graph integrity

### Step 5: Ensure Single Path from Trigger → Output

Removes edges that create multiple paths:
- Finds shortest path from trigger to each output node
- Removes parallel paths
- Keeps only the minimal path

**Example:**
```typescript
// Original graph:
// trigger → A → B → output
// trigger → A → C → output
// Result: Keeps shortest path (trigger → A → B → output)
```

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
  };
}
```

## Usage Examples

### Example 1: Remove Unrequired Nodes

```typescript
const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'summarizer', type: 'text_summarizer', data: {...} },
    { id: 'gmail', type: 'google_gmail', data: {...} },
    { id: 'extra', type: 'set_variable', data: {...} }, // Not required
  ],
  edges: [...]
};

const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const result = pruneWorkflow(workflow, intent);
// Removes: 'extra' node (set_variable not required)
// Result: 4 nodes (trigger, sheets, summarizer, gmail)
```

### Example 2: Remove Loops

```typescript
const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'loop', type: 'loop', data: {...} }, // Not explicitly requested
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "gmail", operation: "send" }
  ]
  // No loop mentioned
};

const result = pruneWorkflow(workflow, intent);
// Removes: 'loop' node (no iteration intent)
// Result: 3 nodes (trigger, sheets, gmail)
```

### Example 3: Remove Duplicate Transformers

```typescript
const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'transform1', type: 'transform', data: {...} },
    { id: 'transform2', type: 'transform', data: {...} }, // Duplicate
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const result = pruneWorkflow(workflow, intent);
// Removes: 'transform2' node (duplicate)
// Result: 3 nodes (trigger, transform1, gmail)
```

### Example 4: Ensure Single Path

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

const result = pruneWorkflow(workflow, intent);
// Removes: 'e4' edge (parallel path)
// Result: Single path: trigger → sheets → summarizer → gmail
```

## Integration

The `WorkflowAutoPruner` can be integrated into the workflow generation pipeline:

```typescript
import { pruneWorkflow } from './workflow-auto-pruner';
import { WorkflowBuilder } from './workflow-builder';
import { IntentStructurer } from './intent-structurer';

// In workflow pipeline
const structurer = new IntentStructurer();
const intent = await structurer.structureIntent(userPrompt);

const builder = new WorkflowBuilder();
const workflow = await builder.buildWorkflow(intent);

// Prune workflow to minimal DAG
const prunedResult = pruneWorkflow(workflow, intent);
const minimalWorkflow = prunedResult.workflow;
```

## Benefits

1. **Minimal DAG**: Only includes nodes and edges required by intent
2. **Clean Graph**: Removes unnecessary complexity
3. **Single Path**: Ensures deterministic execution flow
4. **Intent-Driven**: Pruning based on actual user requirements
5. **Statistics**: Provides detailed pruning information

## Algorithm Details

### Shortest Path Finding

Uses BFS (Breadth-First Search) to find shortest path from trigger to each output:
1. Start from trigger node
2. Explore neighbors level by level
3. Track path (edge IDs) to each node
4. Stop when target output is reached
5. Return path with minimum edges

### Parallel Path Detection

Detects parallel paths by checking:
- Nodes with multiple incoming edges (merge points)
- Nodes with multiple outgoing edges (split points)
- Removes edges that create alternative paths

### Node Type Variants

Handles node type aliases:
- `gmail` → `google_gmail`
- `sheets` → `google_sheets`
- `slack` → `slack_message`
- `summarizer` → `text_summarizer`
