# Memory System Integration Guide

Guide for integrating the memory system with the existing workflow builder.

## Overview

The memory system provides:
- Workflow storage and retrieval
- Execution history tracking
- Similar workflow discovery
- AI context building
- Workflow analysis

## Integration Points

### 1. Workflow Generation

Update `workflow-builder.ts` to use memory system:

```typescript
import { getMemoryManager, getReferenceBuilder } from '../memory';

// In generateFromPrompt method:
const referenceBuilder = getReferenceBuilder();
const context = await referenceBuilder.buildContext(
  null, // No existing workflow
  'creation',
  userPrompt
);

// Use context in AI prompt
const enhancedPrompt = `
Context from similar workflows:
${context.similarPatterns.map(p => `- ${p.name} (similarity: ${p.similarity})`).join('\n')}

User request: ${userPrompt}
`;
```

### 2. Workflow Storage

Store generated workflows automatically:

```typescript
import { getMemoryManager } from '../memory';

// After successful workflow generation:
const memoryManager = getMemoryManager();
const workflowId = await memoryManager.storeWorkflow({
  name: workflowName,
  definition: generatedWorkflow,
  tags: extractedTags,
  settings: workflowSettings,
});
```

### 3. Execution Tracking

Track workflow executions:

```typescript
import { getMemoryManager } from '../memory';

// In execute-workflow.ts:
const memoryManager = getMemoryManager();

await memoryManager.storeExecution({
  workflowId,
  status: 'success',
  inputData: input,
  resultData: output,
  startedAt: startTime,
  finishedAt: endTime,
  executionTime: duration,
  nodeExecutions: nodeExecutionData,
});
```

### 4. Context Injection Middleware

Create middleware for automatic context injection:

```typescript
// src/middleware/workflow-context.ts
import { getReferenceBuilder } from '../memory';

export async function injectWorkflowContext(
  workflowId: string | null,
  userQuery: string
) {
  const referenceBuilder = getReferenceBuilder();
  
  return {
    userQuery,
    workflowContext: await referenceBuilder.buildContext(
      workflowId,
      'creation',
      userQuery
    ),
    systemCapabilities: await getSystemCapabilities(),
    constraints: await getSystemConstraints(),
  };
}
```

## Example: Enhanced Workflow Generation

```typescript
import { getMemoryManager, getReferenceBuilder, getWorkflowAnalyzer } from '../memory';

export async function generateWorkflowWithMemory(
  userPrompt: string,
  existingWorkflowId?: string
) {
  const memoryManager = getMemoryManager();
  const referenceBuilder = getReferenceBuilder();
  const analyzer = getWorkflowAnalyzer();

  // 1. Get context from memory
  const context = await referenceBuilder.buildContext(
    existingWorkflowId || null,
    existingWorkflowId ? 'modification' : 'creation',
    userPrompt
  );

  // 2. Generate workflow (using existing workflow builder)
  const workflow = await generateWorkflow(userPrompt, context);

  // 3. Analyze workflow
  const analysis = analyzer.analyze(workflow);

  // 4. Store in memory
  const storedId = await memoryManager.storeWorkflow({
    name: workflow.name,
    definition: workflow,
    tags: extractTags(userPrompt),
  });

  // 5. Return with analysis and references
  return {
    workflow,
    workflowId: storedId,
    analysis,
    references: {
      similarWorkflows: context.similarPatterns,
      suggestions: context.suggestions,
      warnings: analysis.potentialIssues,
    },
  };
}
```

## API Integration

The memory system is already integrated via API routes. You can:

1. **Store workflows** via `POST /api/memory/store-workflow`
2. **Get context** via `GET /api/memory/workflow/:id/context`
3. **Find similar** via `GET /api/memory/similar/:id`
4. **Search** via `POST /api/memory/search`

## Best Practices

1. **Store all generated workflows** - Enables learning and pattern recognition
2. **Track all executions** - Provides statistics and error analysis
3. **Use context in prompts** - Improves generation quality
4. **Analyze before storing** - Catch issues early
5. **Prune old data** - Run cleanup periodically

## Performance Considerations

- Cache is automatically managed (LRU)
- Vector search requires OpenAI API key
- Database queries are optimized with indexes
- Batch operations when possible

## Monitoring

Monitor the system via:
- `/api/memory/cache/stats` - Cache performance
- `/api/executions/:workflowId/stats` - Execution statistics
- Database query logs - Performance monitoring

## Next Steps

1. Integrate with `generate-workflow.ts` endpoint
2. Add automatic execution tracking
3. Enable context injection in AI prompts
4. Set up monitoring and alerts
