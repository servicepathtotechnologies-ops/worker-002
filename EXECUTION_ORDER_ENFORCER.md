# Execution Order Enforcer

## Overview

The `ExecutionOrderEnforcer` enforces strict execution ordering rules based on data dependencies. Workflows must be topologically sorted so that data flows correctly: producers → transformers → outputs.

## Rules

1. **Data producers first**
   - Google Sheets
   - Database
   - API

2. **Data transformers second**
   - LLM
   - Summarizer
   - Classifier

3. **Output actions last**
   - Email
   - Slack
   - Storage

## Automatic Reordering

If planner produces incorrect order:
```
fetch → send → summarize
```

Automatically reorders to:
```
fetch → summarize → send
```

## Implementation

### File: `worker/src/services/ai/execution-order-enforcer.ts`

### Key Methods

1. **`enforceOrdering(nodes, edges)`** - Main entry point
2. **`categorizeNodes(nodes)`** - Categorizes nodes into producers, transformers, outputs
3. **`buildDependencyGraph(nodes, edges, categories)`** - Builds dependency graph with category-based rules
4. **`topologicalSort(nodes, edges, categories, graph)`** - Topological sort with category priority
5. **`rebuildEdges(sortedNodes, originalEdges)`** - Rebuilds edges based on new order

## Node Categories

### Producer (Priority 1)
- `google_sheets`, `postgresql`, `mysql`, `mongodb`, `database`
- `aws_s3`, `dropbox`, `storage`
- `airtable`, `notion`, `csv`, `excel`
- `http_request`, `api`, `fetch`

### Transformer (Priority 3)
- `text_summarizer`, `ollama`, `openai_gpt`, `anthropic_claude`, `google_gemini`
- `transform`, `format`, `parse`, `filter`, `map`, `reduce`
- `javascript`, `ai_agent`

### Output (Priority 4)
- `google_gmail`, `email`, `slack_message`, `discord`, `telegram`
- `notification`, `webhook_response`
- `database_write`, `google_sheets` (write operations)

### Trigger (Priority 0)
- `manual_trigger`, `schedule`, `webhook`, `form`, `chat_trigger`

### Condition (Priority 2)
- `if_else`, `switch`

## Topological Sort Algorithm

1. **Build dependency graph**:
   - Explicit edges from workflow
   - Implicit dependencies based on categories (producer → transformer → output)

2. **Calculate in-degrees**:
   - Count incoming dependencies for each node

3. **Priority queue**:
   - Process nodes with no dependencies first
   - Prioritize by category: trigger → producer → transformer → output

4. **Process queue**:
   - Remove node with highest priority (lowest number)
   - Add to sorted list
   - Update in-degrees of dependent nodes
   - Add newly available nodes to queue (maintaining priority)

5. **Rebuild edges**:
   - Maintain explicit edges
   - Create implicit edges for sequential flow within categories

## Integration

### Location: `deterministic-workflow-compiler.ts` (STEP 6.5)

**Applied After**:
- Workflow graph building (STEP 6)

**Applied Before**:
- Workflow validation (STEP 7)

```typescript
// STEP 6.5: Enforce strict execution ordering
const { enforceExecutionOrder } = await import('./execution-order-enforcer');
const orderResult = enforceExecutionOrder(workflow.nodes, workflow.edges);

if (orderResult.reordered) {
  workflow = {
    ...workflow,
    nodes: orderResult.nodes,
    edges: orderResult.edges,
  };
}
```

## Example

### Before Reordering

**Planner Output**:
```
1. fetch_data (google_sheets)
2. send (gmail)
3. transform (summarize)
```

**Problem**: Email comes before summarization

### After Reordering

**Execution Order Enforcer**:
```
1. fetch_data (google_sheets) - PRODUCER
2. transform (summarize) - TRANSFORMER
3. send (gmail) - OUTPUT
```

**Result**: Correct data flow

## Dependency Graph Rules

### Explicit Dependencies
- Based on workflow edges
- Direct connections between nodes

### Implicit Dependencies
- **Producers** → All transformers and outputs
- **Transformers** → All outputs
- **Category ordering**: Producer < Transformer < Output

## Validation

The enforcer validates:
- ✅ All nodes are topologically sorted
- ✅ Category ordering is respected
- ✅ Data flow is correct (producer → transformer → output)
- ✅ No cycles in dependency graph

## Benefits

1. **Correct Ordering**: Ensures data flows correctly
2. **Automatic Fix**: Corrects planner mistakes automatically
3. **Deterministic**: Same input always produces same order
4. **Category-Based**: Uses semantic categories for ordering
5. **Topological Sort**: Respects both explicit and implicit dependencies

## Edge Cases

### Multiple Producers
If multiple producers exist, they are processed in order of appearance:
```
producer1 → producer2 → transformer → output
```

### Multiple Transformers
Transformers are processed sequentially:
```
producer → transformer1 → transformer2 → output
```

### Multiple Outputs
Outputs are processed in order:
```
producer → transformer → output1 → output2
```

### Conditional Logic
Conditions are processed between producers and transformers:
```
producer → condition → transformer → output
```

## Integration with Dependency Planner

The `DependencyPlanner` also uses category-based priority in its topological sort:

```typescript
// Category priority for ordering
const getCategoryPriority = (stepIdx: number): number => {
  const step = steps[stepIdx];
  const opType = step.operation.type;
  
  if (opType === SemanticOperationType.FETCH_DATA) return 1; // Producer
  if (opType === SemanticOperationType.TRANSFORM) return 2;   // Transformer
  if (opType === SemanticOperationType.SEND) return 3;        // Output
  return 2; // Default
};
```

This ensures correct ordering at the planning stage, with the enforcer providing a final check and correction.
