# Testing Guide - Workflow Compiler

## Overview

This guide explains how to test the 8-layer workflow compiler without complications.

## Architecture

The compiler is structured in 8 independent layers, each with proper error handling and fallbacks:

1. **Intent Understanding** - `intent-engine.ts`
2. **Task Planning** - `planner-engine.ts`
3. **Node Selection** - `node-resolver.ts` (existing)
4. **Property Inference** - `property-inference-engine.ts`
5. **Graph Generation** - Integrated in `workflow-compiler.ts`
6. **Validation** - `workflow-validator.ts` (existing)
7. **Auth Resolution** - Integrated in `workflow-compiler.ts`
8. **Execution** - `execute-workflow.ts` (existing)

## Error Handling

All layers have:
- ✅ Input validation
- ✅ Try-catch blocks
- ✅ Fallback mechanisms
- ✅ Detailed error messages
- ✅ Graceful degradation

## Testing Individual Layers

### Layer 1: Intent Understanding

```typescript
import { intentEngine } from './services/ai/intent-engine';

// Test with valid prompt
const intent = await intentEngine.extractIntent(
  "Create a sales agent that emails leads"
);
// Returns: { goal, actions, entities, constraints }

// Test with empty prompt (should throw)
try {
  await intentEngine.extractIntent("");
} catch (error) {
  // Expected: "Prompt is required and must be a non-empty string"
}
```

### Layer 2: Task Planning

```typescript
import { plannerEngine } from './services/ai/planner-engine';
import { intentEngine } from './services/ai/intent-engine';

const intent = await intentEngine.extractIntent("Send email to leads");
const plan = await plannerEngine.generatePlan(intent);
// Returns: PlanStep[] with action, tool, reason, dependencies

// Test with invalid intent (should throw)
try {
  await plannerEngine.generatePlan({} as any);
} catch (error) {
  // Expected: "Invalid intent: goal and actions are required"
}
```

### Layer 4: Property Inference

```typescript
import { propertyInferenceEngine } from './services/ai/property-inference-engine';

const result = await propertyInferenceEngine.inferProperties(
  'google_gmail',
  'Send email to leads',
  planStep,
  intent
);
// Returns: { properties, confidence, missingFields, inferredFields }

// Test with invalid node (should return empty result)
const result = await propertyInferenceEngine.inferProperties(
  'invalid_node',
  'test prompt'
);
// Returns: { properties: {}, confidence: 0.0, missingFields: [...], ... }
```

## Testing Complete Pipeline

### Basic Test

```typescript
import { workflowCompiler } from './services/ai/workflow-compiler';

const result = await workflowCompiler.compile(
  "Create a sales agent that emails leads and follows up if they don't reply",
  (progress) => {
    console.log(`${progress.stepName}: ${progress.progress}%`);
  }
);

// Check result
console.log('Workflow nodes:', result.workflow.nodes.length);
console.log('Workflow edges:', result.workflow.edges.length);
console.log('Validation:', result.validation.valid);
console.log('Confidence:', result.confidence);
console.log('Required auth:', result.requiredAuth);
```

### Error Handling Test

```typescript
// Test with empty prompt
try {
  await workflowCompiler.compile("");
} catch (error) {
  // Expected: "Prompt is required and cannot be empty"
}

// Test with invalid prompt (should still work with fallbacks)
const result = await workflowCompiler.compile("asdfghjkl");
// Should return workflow with low confidence
```

## Mock Testing

### Mock Ollama Orchestrator

```typescript
// In test file
jest.mock('./services/ai/ollama-orchestrator', () => ({
  ollamaOrchestrator: {
    processRequest: jest.fn().mockResolvedValue({
      goal: "test goal",
      actions: ["test action"],
      entities: ["test entity"],
      constraints: []
    })
  }
}));
```

### Mock Node Library

```typescript
jest.mock('../nodes/node-library', () => ({
  nodeLibrary: {
    getSchema: jest.fn().mockReturnValue({
      type: 'test_node',
      description: 'Test node',
      configSchema: {
        required: ['field1'],
        optional: { field2: { type: 'string', description: 'Field 2' } }
      }
    }),
    getAllSchemas: jest.fn().mockReturnValue([])
  }
}));
```

## Integration Testing

### Test with Real Services

```typescript
// Full integration test
describe('WorkflowCompiler Integration', () => {
  it('should compile a simple workflow', async () => {
    const compiler = new WorkflowCompiler();
    const result = await compiler.compile(
      "Send email to leads"
    );

    expect(result.workflow.nodes.length).toBeGreaterThan(0);
    expect(result.workflow.edges.length).toBeGreaterThanOrEqual(0);
    expect(result.intent.goal).toBeDefined();
    expect(result.plan.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
```

## Common Issues & Solutions

### Issue: "Node schema not found"

**Solution:** Ensure node exists in node-library. The compiler will use fallback if node not found.

### Issue: "Intent extraction failed"

**Solution:** Check Ollama connection. Compiler has fallback keyword-based extraction.

### Issue: "Plan generation returned empty plan"

**Solution:** Check intent.actions array. Compiler has fallback sequential planning.

### Issue: "Validation failed"

**Solution:** Validation errors are non-critical. Compiler continues and returns validation result.

## Best Practices

1. **Always test with valid prompts first**
2. **Test error cases separately**
3. **Use progress callbacks for debugging**
4. **Check confidence scores**
5. **Verify missingFields for user input requirements**
6. **Test with various prompt complexities**

## Debugging

### Enable Detailed Logging

```typescript
// All layers log to console
// Look for:
// - [IntentEngine] logs
// - [PlannerEngine] logs
// - [PropertyInferenceEngine] logs
// - [WorkflowCompiler] logs
```

### Check Progress Callbacks

```typescript
const result = await workflowCompiler.compile(prompt, (progress) => {
  console.log(`Step ${progress.step}: ${progress.stepName} - ${progress.progress}%`);
  if (progress.details) {
    console.log('Details:', progress.details);
  }
});
```

## Performance Testing

```typescript
const startTime = Date.now();
const result = await workflowCompiler.compile(prompt);
const duration = Date.now() - startTime;

console.log(`Compilation took ${duration}ms`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Nodes: ${result.workflow.nodes.length}`);
```

## Status

✅ All layers have error handling
✅ All layers have input validation
✅ All layers have fallback mechanisms
✅ Compiler is testable and robust
✅ No circular dependencies
✅ Proper TypeScript types
