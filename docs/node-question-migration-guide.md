# Migration Guide: Old to New Question System

## Overview

This guide helps you migrate from the old `node-input-questions.ts` system to the new `node-question-order.ts` system with user-friendly ordering and dependency management.

## Key Differences

| Feature | Old System | New System |
|---------|-----------|------------|
| **Ordering** | Array order | Explicit `askOrder` field |
| **Dependencies** | None | Full dependency support |
| **Conditional Fields** | Manual handling | Automatic filtering |
| **Validation** | External | Built-in validator |
| **Credential Handling** | Manual | Integrated with `askOrder: 0` |
| **Type Safety** | Basic | Full TypeScript types |

## Migration Steps

### Phase 1: Parallel Run (Recommended)

Run both systems in parallel to ensure compatibility:

```typescript
// Keep old system working
import { getQuestionsForNode } from './node-input-questions';

// Add new system
import { getOrderedQuestions } from './node-question-order';
import { getQuestionsForNodeOrdered } from './node-question-adapter';

// Use adapter for backward compatibility
function getQuestions(node: WorkflowNode, answeredFields: Record<string, any> = {}) {
  // Try new system first
  try {
    return getQuestionsForNodeOrdered(node, answeredFields);
  } catch {
    // Fallback to old system
    return getQuestionsForNode(node);
  }
}
```

### Phase 2: Update Node Types One by One

Migrate nodes incrementally:

1. **Start with simple nodes** (triggers, logic)
2. **Then complex nodes** (CRM, integrations)
3. **Test each node type** before moving to next

### Phase 3: Update UI Components

```typescript
// Before
function NodeForm({ node }: { node: WorkflowNode }) {
  const questions = getQuestionsForNode(node);
  
  return (
    <form>
      {questions.map(q => (
        <QuestionField key={q.id} question={q} />
      ))}
    </form>
  );
}

// After
function NodeForm({ node }: { node: WorkflowNode }) {
  const [answers, setAnswers] = useState({});
  const questions = getOrderedQuestions(
    node.data?.type || node.type,
    answers
  );
  
  return (
    <form>
      {questions.map(q => (
        <QuestionField 
          key={q.id} 
          question={q}
          value={answers[q.field]}
          onChange={(val) => setAnswers({ ...answers, [q.field]: val })}
        />
      ))}
    </form>
  );
}
```

### Phase 4: Add Validation

```typescript
// Before
function handleSubmit(answers: Record<string, any>) {
  // Manual validation
  if (!answers.email) {
    showError('Email is required');
    return;
  }
  // ...
}

// After
import { validateAllAnswers } from './node-question-validator';

function handleSubmit(answers: Record<string, any>) {
  const questions = getOrderedQuestions(nodeType, answers);
  const validation = validateAllAnswers(questions, answers);
  
  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }
  // ...
}
```

## Common Migration Patterns

### Pattern 1: Credential Questions

**Before:**
```typescript
// Credential handled separately
if (nodeType === 'hubspot') {
  const credential = await selectCredential('hubspot');
  config.credentialId = credential.id;
}

// Then ask other questions
const questions = getQuestionsForNode(node);
```

**After:**
```typescript
// Credential is first question (askOrder: 0)
const questions = getOrderedQuestions('hubspot', {});
// First question is credential selection
const credentialQ = questions[0]; // askOrder: 0
```

### Pattern 2: Conditional Fields

**Before:**
```typescript
const questions = getQuestionsForNode(node);
questions.forEach(q => {
  // Manual dependency checking
  if (q.target === 'objectId' && config.operation !== 'get') {
    return; // Skip
  }
  // Show question
});
```

**After:**
```typescript
// Dependencies handled automatically
const questions = getOrderedQuestions('hubspot', {
  operation: 'create', // objectId question won't appear
});
```

### Pattern 3: Operation-First Pattern

**Before:**
```typescript
// Operation might be anywhere in the list
const questions = getQuestionsForNode(node);
const operationQ = questions.find(q => q.target === 'operation');
// Show operation first manually
```

**After:**
```typescript
// Operation always second (after credential)
const questions = getOrderedQuestions('hubspot', {});
// questions[1] is always operation (askOrder: 1 or 2)
```

## Code Comparison Examples

### Example 1: HubSpot Node

**Old System:**
```typescript
hubspot: [
  {
    id: 'hubspot_resource',
    prompt: 'Which HubSpot object?',
    target: 'resource',
    type: 'select',
    options: ['contact', 'company', 'deal', 'ticket'],
    required: true,
  },
  {
    id: 'hubspot_operation',
    prompt: 'What should we do?',
    target: 'operation',
    type: 'select',
    options: ['get', 'create', 'update', 'delete', 'search'],
    required: true,
  },
],
// No credential question
// No conditional fields
// No ordering
```

**New System:**
```typescript
hubspot: {
  nodeType: 'hubspot',
  requiresCredential: true,
  credentialProvider: 'hubspot',
  questions: [
    {
      id: 'hubspot_credential',
      field: 'credentialId',
      prompt: 'Which HubSpot connection?',
      type: 'credential',
      required: true,
      askOrder: 0, // First!
    },
    {
      id: 'hubspot_resource',
      field: 'resource',
      prompt: 'Which HubSpot object?',
      type: 'select',
      required: true,
      askOrder: 1,
      options: [...],
    },
    {
      id: 'hubspot_operation',
      field: 'operation',
      prompt: 'What should we do?',
      type: 'select',
      required: true,
      askOrder: 2,
      options: [...],
    },
    {
      id: 'hubspot_objectId',
      field: 'objectId',
      prompt: 'Object ID?',
      type: 'string',
      required: false,
      askOrder: 3,
      dependsOn: {
        field: 'operation',
        operator: 'in',
        value: ['get', 'update', 'delete'],
      },
    },
    // ... more conditional fields
  ],
}
```

### Example 2: Gmail Node

**Old System:**
```typescript
google_gmail: [
  {
    id: 'gmail_to',
    prompt: 'What email address?',
    target: 'to',
    type: 'string',
    required: true, // Always required
  },
  {
    id: 'gmail_subject',
    prompt: 'What subject?',
    target: 'subject',
    type: 'string',
    required: true, // Always required
  },
],
// No operation question
// No conditional logic
```

**New System:**
```typescript
google_gmail: {
  requiresCredential: true,
  questions: [
    {
      field: 'credentialId',
      askOrder: 0,
      type: 'credential',
    },
    {
      field: 'operation',
      askOrder: 1,
      type: 'select',
      options: ['send', 'list', 'get', 'search'],
      default: 'send',
    },
    {
      field: 'to',
      askOrder: 2,
      type: 'email',
      required: false,
      dependsOn: {
        field: 'operation',
        operator: 'equals',
        value: 'send',
      },
      // Only required when operation = 'send'
    },
    // ... more conditional fields
  ],
}
```

## Testing Migration

### Test Checklist

- [ ] All node types have question configs
- [ ] Questions appear in correct order
- [ ] Conditional fields show/hide correctly
- [ ] Credential questions appear first
- [ ] Operation questions appear second
- [ ] Validation works for all question types
- [ ] Backward compatibility maintained

### Test Cases

```typescript
describe('Migration Tests', () => {
  test('should maintain backward compatibility', () => {
    const oldQuestions = getQuestionsForNode(node);
    const newQuestions = getQuestionsForNodeOrdered(node, {});
    
    // Same number of base questions (before dependencies)
    expect(newQuestions.length).toBeGreaterThanOrEqual(oldQuestions.length);
  });

  test('should show credential first', () => {
    const questions = getOrderedQuestions('hubspot', {});
    expect(questions[0].type).toBe('credential');
  });

  test('should filter conditional fields', () => {
    const withCreate = getOrderedQuestions('hubspot', {
      operation: 'create',
    });
    const withGet = getOrderedQuestions('hubspot', {
      operation: 'get',
    });
    
    // Different questions based on operation
    expect(withCreate.length).not.toBe(withGet.length);
  });
});
```

## Rollback Plan

If issues occur, you can rollback:

```typescript
// Feature flag
const USE_NEW_QUESTION_SYSTEM = process.env.USE_NEW_QUESTIONS === 'true';

function getQuestions(node: WorkflowNode, answers: Record<string, any> = {}) {
  if (USE_NEW_QUESTION_SYSTEM) {
    return getQuestionsForNodeOrdered(node, answers);
  } else {
    return getQuestionsForNode(node);
  }
}
```

## Timeline Recommendation

1. **Week 1**: Set up parallel systems, test adapter
2. **Week 2**: Migrate trigger and logic nodes
3. **Week 3**: Migrate CRM nodes
4. **Week 4**: Migrate communication and social nodes
5. **Week 5**: Full testing and cleanup
6. **Week 6**: Remove old system (if desired)

## Support

For questions or issues during migration:
- Check `node-question-order-usage.md` for API reference
- Review `node-questioning-architecture.md` for full specs
- See `node-question-integration-guide.md` for examples

---

*Migration completed? Update this guide with your learnings!*
