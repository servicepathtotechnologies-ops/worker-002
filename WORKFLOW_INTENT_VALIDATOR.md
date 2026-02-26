# Workflow Intent Validator

## Overview

The `WorkflowIntentValidator` validates workflows against structured intent to ensure they match user requirements.

## Validation Rules

1. ✅ **Every action in intent exists in workflow**
2. ✅ **No extra actions** (excluding trigger and utility nodes)
3. ✅ **Correct execution order**
4. ✅ **Minimal path** (no parallel paths, no cycles, no unreachable nodes)

## Behavior

If validation fails → triggers workflow regeneration

## API

### Function: `validateWorkflowIntent(workflow, intent) → ValidationResult`

```typescript
import { validateWorkflowIntent } from './workflow-intent-validator';
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

const result = validateWorkflowIntent(workflow, intent);
// Returns: { valid, errors, warnings, shouldRegenerate, details }
```

### Class: `WorkflowIntentValidator`

```typescript
import { WorkflowIntentValidator } from './workflow-intent-validator';

const validator = new WorkflowIntentValidator();
const result = validator.validate(workflow, intent);
```

## ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;                    // Overall validation result
  errors: string[];                  // Critical errors (missing actions, order issues)
  warnings: string[];                // Warnings (extra actions, path issues)
  shouldRegenerate: boolean;         // Whether workflow should be regenerated
  details: {
    missingActions: string[];        // Actions in intent but not in workflow
    extraActions: string[];          // Actions in workflow but not in intent
    orderMismatches: OrderMismatch[]; // Execution order issues
    pathIssues: PathIssue[];         // Non-minimal path issues
  };
}
```

## Validation Steps

### Step 1: Validate Every Action Exists

Checks that all actions from intent are present in workflow:
- Uses `IntentConstraintEngine` to get required node types
- Checks for exact matches or variants (e.g., `gmail` → `google_gmail`)
- Reports missing actions as errors

**Example:**
```typescript
// Intent: [google_sheets, summarize, gmail]
// Workflow: [trigger, google_sheets, gmail]
// Result: ❌ Missing "summarize" action
```

### Step 2: Validate No Extra Actions

Checks that workflow doesn't have actions not in intent:
- Excludes trigger nodes (always required)
- Excludes utility nodes (set_variable, format, parse, transform)
- Reports extra actions as warnings

**Example:**
```typescript
// Intent: [google_sheets, gmail]
// Workflow: [trigger, google_sheets, transform, gmail]
// Result: ⚠️ Extra action "transform" (if not utility)
```

### Step 3: Validate Execution Order

Checks that workflow execution order matches intent:
- Gets expected order from intent actions
- Gets actual order from workflow (topological sort)
- Compares orders and reports mismatches

**Example:**
```typescript
// Intent order: [google_sheets, summarize, gmail]
// Workflow order: [google_sheets, gmail, summarize]
// Result: ❌ Order mismatch at position 1
```

### Step 4: Validate Minimal Path

Checks that workflow has minimal path:
- **Parallel Paths**: Detects multiple paths between nodes
- **Cycles**: Detects cycles in workflow graph
- **Unreachable Nodes**: Detects nodes not reachable from trigger

**Example:**
```typescript
// Workflow has parallel paths:
// trigger → A → B → output
// trigger → A → C → output
// Result: ⚠️ Parallel paths detected
```

## Regeneration Trigger

Workflow regeneration is triggered if:
- ❌ **Errors present**: Missing actions or order mismatches
- ⚠️ **Warnings + Extra Actions**: Extra actions present with warnings
- ⚠️ **Order Mismatches**: Execution order doesn't match intent

## Usage Examples

### Example 1: Missing Action

```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'gmail', type: 'google_gmail', data: {...} },
    // Missing: summarize
  ],
  edges: [...]
};

const result = validateWorkflowIntent(workflow, intent);
// Result: {
//   valid: false,
//   errors: ['Required action "text_summarizer" from intent is missing in workflow'],
//   shouldRegenerate: true,
//   details: { missingActions: ['text_summarizer'] }
// }
```

### Example 2: Extra Action

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
    { id: 'transform', type: 'transform', data: {...} }, // Extra
    { id: 'gmail', type: 'google_gmail', data: {...} },
  ],
  edges: [...]
};

const result = validateWorkflowIntent(workflow, intent);
// Result: {
//   valid: true,
//   warnings: ['Extra action "transform" in workflow not present in intent'],
//   shouldRegenerate: false, // Only warnings, no errors
//   details: { extraActions: ['transform'] }
// }
```

### Example 3: Order Mismatch

```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const workflow: Workflow = {
  nodes: [
    { id: 'trigger', type: 'manual_trigger', data: {...} },
    { id: 'sheets', type: 'google_sheets', data: {...} },
    { id: 'gmail', type: 'google_gmail', data: {...} },
    { id: 'summarizer', type: 'text_summarizer', data: {...} },
  ],
  edges: [
    { id: 'e1', source: 'trigger', target: 'sheets' },
    { id: 'e2', source: 'sheets', target: 'gmail' },
    { id: 'e3', source: 'gmail', target: 'summarizer' }, // Wrong order
  ]
};

const result = validateWorkflowIntent(workflow, intent);
// Result: {
//   valid: false,
//   errors: ['Execution order mismatch at position 1: expected "text_summarizer", got "google_gmail"'],
//   shouldRegenerate: true,
//   details: { orderMismatches: [...] }
// }
```

### Example 4: Parallel Paths

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

const result = validateWorkflowIntent(workflow, intent);
// Result: {
//   valid: true,
//   warnings: ['Workflow has 1 parallel path(s), should be minimal'],
//   shouldRegenerate: false,
//   details: { pathIssues: [{ issue: 'Found 1 parallel path(s)', suggestion: '...' }] }
// }
```

## Integration

The `WorkflowIntentValidator` can be integrated into the workflow generation pipeline:

```typescript
import { validateWorkflowIntent } from './workflow-intent-validator';
import { WorkflowBuilder } from './workflow-builder';
import { IntentStructurer } from './intent-structurer';

// In workflow pipeline
const structurer = new IntentStructurer();
const intent = await structurer.structureIntent(userPrompt);

const builder = new WorkflowBuilder();
const workflow = await builder.buildWorkflow(intent);

// Validate workflow against intent
const validation = validateWorkflowIntent(workflow, intent);

if (!validation.valid || validation.shouldRegenerate) {
  // Regenerate workflow
  console.log('Regenerating workflow due to validation failures...');
  // Trigger regeneration logic
}
```

## Benefits

1. **Intent Compliance**: Ensures workflow matches user intent
2. **Order Validation**: Verifies correct execution order
3. **Minimal Path**: Ensures efficient workflow structure
4. **Auto-Regeneration**: Triggers regeneration when invalid
5. **Detailed Feedback**: Provides specific errors and warnings
