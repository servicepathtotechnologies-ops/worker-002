# Minimal Workflow Policy

## Overview

The `MinimalWorkflowPolicy` enforces minimal workflow generation rules to ensure workflows contain only nodes required to satisfy user intent.

## Rules

1. ✅ **Workflow must contain only nodes required to satisfy user intent**
2. ✅ **Remove nodes not explicitly required by normalized intent**
3. ✅ **Do not add:**
   - loops unless user requests iteration
   - extra transformers
   - repair nodes unless execution failure occurs
4. ✅ **Workflow must follow minimal path: trigger → actions → output**

## Example

**User Intent:**
```
"Get data from Google Sheets, summarize it, send to Gmail"
```

**Allowed Nodes:**
- `google_sheets`
- `text_summarizer`
- `gmail`

**Forbidden Nodes:**
- `loop` (unless iteration requested)
- duplicate `text_summarizer`
- extra processing nodes (set_variable, format, parse, etc.)

## API

### Function: `enforceMinimalWorkflowPolicy(workflow, intent) → PolicyEnforcementResult`

```typescript
import { enforceMinimalWorkflowPolicy } from './minimal-workflow-policy';
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

const result = enforceMinimalWorkflowPolicy(workflow, intent);
// Returns: { workflow, violations, removedNodes, removedEdges, statistics }
```

### Class: `MinimalWorkflowPolicy`

```typescript
import { MinimalWorkflowPolicy } from './minimal-workflow-policy';

const policy = new MinimalWorkflowPolicy();
const result = policy.enforce(workflow, intent);
```

## Policy Enforcement Steps

### Step 1: Remove Forbidden Nodes

Removes nodes that violate policy rules:

**Loops:**
- Removed unless user requests iteration
- Checks intent for keywords: `loop`, `iterate`, `repeat`, `for each`, `foreach`, `each`

**Repair Nodes:**
- Removed unless user requests failure handling
- Checks intent for keywords: `error`, `failure`, `retry`, `handle`, `catch`

**Extra Processing Nodes:**
- Removed if not in required node set
- Types: `set_variable`, `format`, `parse`, `transform`, `filter`, `map`, `reduce`

### Step 2: Remove Duplicate Transformers

Keeps only the first occurrence of each transformer type:
- `transform`
- `set_variable`
- `format`
- `parse`
- `filter`
- `map`
- `reduce`

### Step 3: Remove Unrequired Nodes

Removes nodes not in required node set:
- Uses `IntentConstraintEngine` to get required nodes
- Keeps trigger nodes (always required)
- Keeps nodes that match required types or variants
- Removes all other nodes

### Step 4: Ensure Minimal Path

Enforces minimal path: `trigger → actions → output`
- Finds shortest path from trigger to each output
- Removes parallel paths
- Keeps only minimal DAG structure

## PolicyEnforcementResult

```typescript
interface PolicyEnforcementResult {
  workflow: Workflow;              // Policy-enforced minimal workflow
  violations: PolicyViolation[];   // Policy violations found
  removedNodes: string[];          // IDs of removed nodes
  removedEdges: string[];          // IDs of removed edges
  statistics: {
    originalNodeCount: number;     // Nodes before enforcement
    minimalNodeCount: number;      // Nodes after enforcement
    originalEdgeCount: number;     // Edges before enforcement
    minimalEdgeCount: number;      // Edges after enforcement
  };
}
```

## PolicyViolation

```typescript
interface PolicyViolation {
  type: 'forbidden_node' | 'duplicate_transformer' | 'unnecessary_loop' | 'extra_processing' | 'non_minimal_path';
  nodeId?: string;
  nodeType?: string;
  reason: string;
  suggestion: string;
}
```

## Usage Examples

### Example 1: Remove Loop

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
    { id: 'loop', type: 'loop', data: {...} }, // Forbidden
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const result = enforceMinimalWorkflowPolicy(workflow, intent);
// Removes: 'loop' node
// Result: [trigger, sheets, gmail]
```

### Example 2: Remove Duplicate Transformers

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

const result = enforceMinimalWorkflowPolicy(workflow, intent);
// Removes: 'transform2' node
// Result: [trigger, transform1, gmail]
```

### Example 3: Remove Extra Processing Nodes

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
    { id: 'set_var', type: 'set_variable', data: {...} }, // Extra
    { id: 'format', type: 'format', data: {...} }, // Extra
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const result = enforceMinimalWorkflowPolicy(workflow, intent);
// Removes: 'set_var', 'format' nodes
// Result: [trigger, sheets, gmail]
```

### Example 4: Ensure Minimal Path

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

const result = enforceMinimalWorkflowPolicy(workflow, intent);
// Removes: 'e4' edge (parallel path)
// Result: Single path: trigger → sheets → summarizer → gmail
```

## Integration

The `MinimalWorkflowPolicy` is integrated into the workflow generation pipeline:

**Location**: `workflow-pipeline-orchestrator.ts` (STEP 3.2)

**Applied After**:
- Workflow generation (STEP 3)
- Workflow normalization (STEP 3.1)

**Applied Before**:
- Workflow explanation (STEP 3.5)
- Confirmation stage (STEP 4)

```typescript
// In workflow pipeline (STEP 3.2)
const { enforceMinimalWorkflowPolicy } = await import('./minimal-workflow-policy');
const policyResult = enforceMinimalWorkflowPolicy(workflow, structuredIntent);

// Use minimal workflow (policy-enforced)
workflow = policyResult.workflow;
```

## Benefits

1. **Minimal Workflows**: Only includes nodes required by intent
2. **No Unnecessary Complexity**: Removes loops, duplicates, extra processing
3. **Single Path**: Ensures deterministic execution flow
4. **Intent Compliance**: Workflow matches user requirements exactly
5. **Automatic Enforcement**: Applied automatically after workflow generation

## Policy Violations

### Forbidden Node
- **Type**: `forbidden_node`
- **Reason**: Node type not allowed by policy
- **Example**: Loop node without iteration intent

### Duplicate Transformer
- **Type**: `duplicate_transformer`
- **Reason**: Multiple transformers of same type
- **Example**: Two `transform` nodes

### Unnecessary Loop
- **Type**: `unnecessary_loop`
- **Reason**: Loop node without iteration intent
- **Example**: `loop` node when user didn't request iteration

### Extra Processing
- **Type**: `extra_processing`
- **Reason**: Extra processing node not required
- **Example**: `set_variable` not in intent

### Non-Minimal Path
- **Type**: `non_minimal_path`
- **Reason**: Parallel paths detected
- **Example**: Multiple paths from same source to same target
