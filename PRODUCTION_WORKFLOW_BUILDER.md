# Production-Grade Workflow Builder

## Overview

The Production-Grade Workflow Builder enforces strict production requirements for workflow generation:

1. **Deterministic generation** - No randomness, same input = same output
2. **No hallucinated nodes** - Only use nodes from capability registry
3. **Dependency-based planning** - Order based on data dependencies
4. **Capability registry** - Validate all nodes exist
5. **Type-safe connections** - Validate type compatibility
6. **Minimal workflows** - Only required nodes
7. **Validation before return** - Comprehensive validation
8. **Retry generation if invalid** - Regenerate on failure

## Pipeline

### STEP 1: Validate Intent and Get Required Nodes (No Hallucination)

```typescript
const requiredNodes = intentConstraintEngine.getRequiredNodes(intent);
```

- Extracts required nodes from structured intent
- Uses `IntentConstraintEngine` to ensure only required nodes
- No hallucinated nodes - only nodes explicitly required by intent

### STEP 2: Validate Nodes in Capability Registry (No Hallucination)

```typescript
const nodeValidation = this.validateNodesInRegistry(requiredNodes);
```

- Validates all nodes exist in capability registry
- Rejects any nodes not in registry (hallucinated nodes)
- Ensures all nodes have capability information

### STEP 3: Deterministic Workflow Compilation

```typescript
const compilationResult = deterministicWorkflowCompiler.compile(intent, originalPrompt);
```

- Uses deterministic compiler (no randomness)
- Same input always produces same output
- No heuristic guessing

### STEP 4: Enforce Execution Ordering (Dependency-Based Planning)

```typescript
const orderResult = enforceExecutionOrder(workflow.nodes, workflow.edges);
```

- Orders nodes based on data dependencies
- Producer → Transformer → Output
- Topological sort with category priority

### STEP 5: Validate Type-Safe Connections

```typescript
const typeValidation = validateWorkflowTypes(workflow.nodes, workflow.edges);
```

- Validates type compatibility between connected nodes
- Auto-transforms type mismatches when possible
- Rejects incompatible connections

### STEP 6: Enforce Minimal Workflow

```typescript
const pruningResult = workflowGraphPruner.prune(workflow, intent);
```

- Removes unnecessary nodes
- Removes duplicate nodes
- Ensures single path from trigger to output

### STEP 7: Final Validation Before Return

```typescript
const finalValidation = validateFinalWorkflow(workflow);
```

- Validates all nodes connected to output
- Validates no orphan nodes
- Validates no duplicate triggers
- Validates data flows correctly
- Validates each node has required inputs
- Validates workflow minimal

### STEP 8: Retry Generation if Invalid

If validation fails:
- Retry up to `maxRetries` times (default: 3)
- Regenerate workflow from intent
- Only return valid workflows

## Integration

### Location: `workflow-pipeline-orchestrator.ts` (STEP 2)

**Replaces**:
- Old heuristic-based workflow builder
- Old deterministic compiler (now used internally)

**New Flow**:
```typescript
const { buildProductionWorkflow } = await import('./production-workflow-builder');
const buildResult = await buildProductionWorkflow(structuredIntent, userPrompt, {
  maxRetries: 3,
  strictMode: true,
  allowRegeneration: true,
});
```

## Build Options

```typescript
interface BuildOptions {
  maxRetries?: number;      // Max retry attempts (default: 3)
  strictMode?: boolean;     // Strict validation (default: true)
  allowRegeneration?: boolean; // Allow regeneration (default: true)
}
```

## Build Result

```typescript
interface ProductionBuildResult {
  success: boolean;
  workflow?: Workflow;
  errors: string[];
  warnings: string[];
  metadata: {
    buildAttempts: number;
    validationAttempts: number;
    nodesUsed: string[];
    buildTime: number;
  };
}
```

## Requirements Enforcement

### 1. Deterministic Generation ✅

- Uses deterministic compiler (no randomness)
- Same input always produces same output
- No LLM calls with random temperature

### 2. No Hallucinated Nodes ✅

- Validates all nodes in capability registry
- Rejects nodes not in registry
- Only uses nodes from `IntentConstraintEngine`

### 3. Dependency-Based Planning ✅

- Uses `ExecutionOrderEnforcer`
- Topological sort with category priority
- Producer → Transformer → Output

### 4. Capability Registry ✅

- Validates all nodes exist in registry
- Uses `capabilityRegistry.getCapability()`
- Ensures capability information exists

### 5. Type-Safe Connections ✅

- Uses `nodeDataTypeSystem.validateWorkflowTypes()`
- Auto-transforms type mismatches
- Rejects incompatible connections

### 6. Minimal Workflows ✅

- Uses `workflowGraphPruner.prune()`
- Removes unnecessary nodes
- Ensures single path

### 7. Validation Before Return ✅

- Uses `finalWorkflowValidator.validate()`
- Comprehensive validation checks
- Only returns valid workflows

### 8. Retry Generation if Invalid ✅

- Retry loop up to `maxRetries`
- Regenerates on validation failure
- Only returns after successful validation

## Example

### Input

```typescript
const intent: StructuredIntent = {
  trigger: 'manual_trigger',
  actions: [
    { type: 'google_sheets', operation: 'read' },
    { type: 'text_summarizer', operation: 'summarize' },
    { type: 'google_gmail', operation: 'send' }
  ],
  requires_credentials: ['google_sheets', 'google_gmail']
};
```

### Build Process

1. **STEP 1**: Get required nodes → `['google_sheets', 'text_summarizer', 'google_gmail']`
2. **STEP 2**: Validate in registry → ✅ All nodes exist
3. **STEP 3**: Compile workflow → ✅ Deterministic compilation
4. **STEP 4**: Enforce ordering → ✅ Producer → Transformer → Output
5. **STEP 5**: Validate types → ✅ All types compatible
6. **STEP 6**: Prune workflow → ✅ Minimal workflow
7. **STEP 7**: Final validation → ✅ All checks pass
8. **STEP 8**: Return workflow → ✅ Valid workflow

### Output

```typescript
{
  success: true,
  workflow: {
    nodes: [
      { id: '...', type: 'manual_trigger', ... },
      { id: '...', type: 'google_sheets', ... },
      { id: '...', type: 'text_summarizer', ... },
      { id: '...', type: 'google_gmail', ... }
    ],
    edges: [
      { source: 'trigger', target: 'google_sheets', ... },
      { source: 'google_sheets', target: 'text_summarizer', ... },
      { source: 'text_summarizer', target: 'google_gmail', ... }
    ]
  },
  errors: [],
  warnings: [],
  metadata: {
    buildAttempts: 1,
    validationAttempts: 2,
    nodesUsed: ['manual_trigger', 'google_sheets', 'text_summarizer', 'google_gmail'],
    buildTime: 245
  }
}
```

## Error Handling

### Retry Logic

If validation fails:
1. Log error details
2. Check if retries remaining
3. Regenerate workflow
4. Re-validate
5. Return after success or max retries

### Error Types

1. **Compilation Errors**: Deterministic compiler failures
2. **Type Validation Errors**: Type incompatibility
3. **Final Validation Errors**: Comprehensive validation failures
4. **Registry Errors**: Nodes not in capability registry

## Benefits

1. **Production-Ready**: Enforces all production requirements
2. **Deterministic**: Same input always produces same output
3. **Type-Safe**: All connections validated
4. **Minimal**: Only required nodes
5. **Validated**: Comprehensive validation before return
6. **Resilient**: Retry on failure
7. **No Hallucination**: Only uses nodes from registry

## Performance

- **Build Time**: Typically 200-500ms
- **Validation Time**: Typically 50-100ms per validation
- **Retry Overhead**: Minimal (only on failure)
- **Total Time**: < 1s for successful builds

## Monitoring

The builder logs:
- Build attempts
- Validation attempts
- Build time
- Nodes used
- Errors and warnings

This enables monitoring and debugging of production builds.
