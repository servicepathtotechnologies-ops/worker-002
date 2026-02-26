# Deterministic Workflow Compiler

## Overview

The Deterministic Workflow Compiler converts the workflow generation system from heuristic-based guessing to a production-grade, deterministic intent → workflow compiler.

## Architecture

### Pipeline Steps

1. **STEP 1: Intent Extraction Layer** - Parse user prompt into semantic operations
2. **STEP 2: Capability Registry** - Map all nodes with input/output types
3. **STEP 3: Dependency Planner** - Build execution order based on data flow
4. **STEP 4: Node Mapping** - Map semantic steps to nodes using registry
5. **STEP 5: Loop Insertion Rule** - Insert loops only when required
6. **STEP 6: Workflow Validator** - Reject invalid workflows
7. **STEP 7: Output minimal workflow**

## Components

### 1. Intent Extraction Layer

**File**: `worker/src/services/ai/intent-extraction-layer.ts`

Parses user prompt into semantic operations:

```typescript
"get data from sheets, summarize, send email"
→
[
  {type:"fetch_data", source:"google_sheets"},
  {type:"transform", operation:"summarize"},
  {type:"send", destination:"gmail"}
]
```

**Semantic Operation Types**:
- `FETCH_DATA` - Data sources
- `TRANSFORM` - Transformations
- `SEND` - Outputs
- `STORE` - Storage operations
- `CONDITION` - Conditional logic
- `LOOP` - Iteration

### 2. Capability Registry

**File**: `worker/src/services/ai/capability-registry.ts`

Maps all nodes to their input/output capabilities:

```typescript
{
  nodeType: "google_sheets",
  inputType: DataType.ANY,
  outputType: DataType.ARRAY,
  acceptsArray: false,
  requiresScalar: false,
  supportsBatch: false,
  producesData: true
}
```

**Data Types**:
- `TEXT` - Text data
- `OBJECT` - Object data
- `ARRAY` - Array data
- `NUMBER` - Numeric data
- `BOOLEAN` - Boolean data
- `ANY` - Any type

### 3. Dependency Planner

**File**: `worker/src/services/ai/dependency-planner.ts`

Builds execution order based on data flow:

**Rules**:
- Producer nodes first (data sources)
- Transformers next
- Consumers last (outputs)
- Reject invalid graphs

**Validation**:
- Detects cycles
- Validates ordering
- Ensures dependencies are satisfied

### 4. Node Mapping

**File**: `worker/src/services/ai/node-mapper.ts`

Maps semantic operations to concrete node types using the capability registry.

**Mapping Rules**:
- `fetch_data` → Data source nodes (google_sheets, postgresql, etc.)
- `transform` → Transformation nodes (text_summarizer, ollama, etc.)
- `send` → Output nodes (google_gmail, slack_message, etc.)
- `store` → Storage nodes (same as fetch_data)
- `condition` → Conditional nodes (if_else, switch)

### 5. Loop Insertion Rule

**File**: `worker/src/services/ai/loop-insertion-rule.ts`

**Rule**: Loop should be added ONLY IF:
- upstream produces array AND
- downstream requires scalar

**Example**:
```
google_sheets (produces array) → loop → text_summarizer (requires scalar)
```

### 6. Workflow Validator

**File**: `worker/src/services/ai/deterministic-workflow-validator.ts`

**Rejects workflow if**:
- Email before summarization
- Unused nodes exist
- Data type mismatch
- Disconnected graph

**Validation Checks**:
- Execution ordering
- Data type compatibility
- Graph structure (no cycles, all connected)
- Unused nodes

### 7. Deterministic Workflow Compiler

**File**: `worker/src/services/ai/deterministic-workflow-compiler.ts`

Main orchestrator that runs all steps in sequence.

## Usage

```typescript
import { compileWorkflow } from './deterministic-workflow-compiler';
import { StructuredIntent } from './intent-structurer';

const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const result = compileWorkflow(intent, "get data from sheets, summarize, send email");

if (result.success) {
  console.log("Workflow compiled:", result.workflow);
} else {
  console.error("Compilation errors:", result.errors);
}
```

## Integration

The deterministic compiler is integrated into the workflow pipeline:

**Location**: `workflow-pipeline-orchestrator.ts` (STEP 2)

**Replaces**:
- Old heuristic-based workflow structure builder
- Sample workflow matching
- Heuristic node guessing

**Benefits**:
- ✅ Deterministic output
- ✅ No hallucinated structures
- ✅ Correct node ordering
- ✅ Data dependency validation
- ✅ Minimal workflows only

## Example Flow

**Input**:
```
"Get data from Google Sheets, summarize it, send to Gmail"
```

**STEP 1: Intent Extraction**:
```typescript
[
  {type:"fetch_data", source:"google_sheets", order:0},
  {type:"transform", operation:"summarize", order:1},
  {type:"send", destination:"gmail", order:2}
]
```

**STEP 2: Capability Registry**:
```typescript
google_sheets → {outputType: ARRAY, producesData: true}
text_summarizer → {inputType: [TEXT, ARRAY], outputType: TEXT, acceptsArray: true}
google_gmail → {inputType: TEXT, requiresScalar: true}
```

**STEP 3: Dependency Planner**:
```typescript
[
  {operation: fetch_data, order: 0, dependencies: []},
  {operation: transform, order: 1, dependencies: [0]},
  {operation: send, order: 2, dependencies: [1]}
]
```

**STEP 4: Node Mapping**:
```typescript
[
  {nodeType: "google_sheets", order: 0},
  {nodeType: "text_summarizer", order: 1},
  {nodeType: "google_gmail", order: 2}
]
```

**STEP 5: Loop Insertion**:
```typescript
// Check: google_sheets produces array, text_summarizer accepts array
// No loop needed (text_summarizer accepts array)
```

**STEP 6: Validation**:
```typescript
✅ Valid: correct ordering, type compatibility, connected graph
```

**STEP 7: Output**:
```typescript
{
  nodes: [trigger, google_sheets, text_summarizer, google_gmail],
  edges: [trigger→sheets, sheets→summarizer, summarizer→gmail]
}
```

## Key Differences from Old System

| Feature | Old System | New System |
|---------|-----------|------------|
| **Approach** | Heuristic guessing | Deterministic compilation |
| **Node Selection** | Pattern matching | Capability-based mapping |
| **Ordering** | Heuristic connections | Dependency-based planning |
| **Loops** | Always added | Only when required |
| **Validation** | Post-generation | Built-in validation |
| **Output** | May include extra nodes | Minimal workflow only |

## Benefits

1. **Deterministic**: Same input always produces same output
2. **Correct Ordering**: Based on data flow dependencies
3. **No Hallucination**: Only uses nodes from capability registry
4. **Type Safety**: Validates data type compatibility
5. **Minimal**: Only includes required nodes
6. **Production-Grade**: Strict validation and error handling
