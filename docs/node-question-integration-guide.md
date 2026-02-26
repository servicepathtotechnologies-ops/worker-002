# Node Question System - Integration Guide

## Overview

This guide shows how to integrate the new node question ordering system into your workflow builder, UI components, and API endpoints.

## Table of Contents

1. [Quick Integration](#quick-integration)
2. [API Integration](#api-integration)
3. [UI Component Integration](#ui-component-integration)
4. [Workflow Builder Integration](#workflow-builder-integration)
5. [Migration from Old System](#migration-from-old-system)
6. [Advanced Features](#advanced-features)

---

## Quick Integration

### Step 1: Import the System

```typescript
import {
  getQuestionConfig,
  getOrderedQuestions,
  getNextQuestion,
  areAllRequiredQuestionsAnswered,
} from '../services/ai/node-question-order';
import { validateAnswer, validateAllAnswers } from '../services/ai/node-question-validator';
```

### Step 2: Use in Your Code

```typescript
// Get questions for a node type
const questions = getOrderedQuestions('hubspot', {});

// Get next question
const nextQuestion = getNextQuestion('hubspot', {
  credentialId: 'cred_123',
  resource: 'contact',
});

// Validate answers
const validation = validateAnswer(nextQuestion, userAnswer);
```

---

## API Integration

### Endpoint: Get Questions for Node

```typescript
// GET /api/nodes/:nodeType/questions
export async function getNodeQuestions(req: Request, res: Response) {
  const { nodeType } = req.params;
  const { answeredFields = {} } = req.query;

  try {
    const questions = getOrderedQuestions(
      nodeType,
      JSON.parse(answeredFields as string || '{}')
    );

    res.json({
      success: true,
      questions: questions.map(q => ({
        id: q.id,
        prompt: q.prompt,
        field: q.field,
        type: q.type,
        required: q.required,
        options: q.options,
        example: q.example,
        placeholder: q.placeholder,
        description: q.description,
      })),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}
```

### Endpoint: Get Next Question

```typescript
// GET /api/nodes/:nodeType/next-question
export async function getNextNodeQuestion(req: Request, res: Response) {
  const { nodeType } = req.params;
  const { answeredFields = {} } = req.query;

  try {
    const nextQuestion = getNextQuestion(
      nodeType,
      JSON.parse(answeredFields as string || '{}')
    );

    if (!nextQuestion) {
      return res.json({
        success: true,
        complete: true,
        message: 'All required questions answered',
      });
    }

    res.json({
      success: true,
      complete: false,
      question: {
        id: nextQuestion.id,
        prompt: nextQuestion.prompt,
        field: nextQuestion.field,
        type: nextQuestion.type,
        required: nextQuestion.required,
        options: nextQuestion.options,
        example: nextQuestion.example,
        placeholder: nextQuestion.placeholder,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}
```

### Endpoint: Validate Answer

```typescript
// POST /api/nodes/:nodeType/validate
export async function validateNodeAnswer(req: Request, res: Response) {
  const { nodeType } = req.params;
  const { field, answer } = req.body;

  try {
    const config = getQuestionConfig(nodeType);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Node type ${nodeType} not found`,
      });
    }

    const question = config.questions.find(q => q.field === field);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: `Field ${field} not found`,
      });
    }

    const validation = validateAnswer(question, answer);

    res.json({
      success: true,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}
```

---

## UI Component Integration

### React Component Example

```typescript
import React, { useState, useEffect } from 'react';
import { getOrderedQuestions, getNextQuestion } from '../services/ai/node-question-order';
import { validateAnswer } from '../services/ai/node-question-validator';

interface NodeQuestionFormProps {
  nodeType: string;
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void;
}

export function NodeQuestionForm({
  nodeType,
  initialValues = {},
  onSubmit,
}: NodeQuestionFormProps) {
  const [answers, setAnswers] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);

  useEffect(() => {
    const nextQ = getNextQuestion(nodeType, answers);
    setCurrentQuestion(nextQ);
  }, [nodeType, answers]);

  const handleAnswer = (field: string, value: any) => {
    const newAnswers = { ...answers, [field]: value };
    setAnswers(newAnswers);

    // Validate
    if (currentQuestion && currentQuestion.field === field) {
      const validation = validateAnswer(currentQuestion, value);
      setErrors({
        ...errors,
        [field]: validation.errors,
      });
    }
  };

  const handleSubmit = () => {
    // Validate all answers
    const questions = getOrderedQuestions(nodeType, answers);
    const validation = validateAllAnswers(questions, answers);

    if (validation.valid) {
      onSubmit(answers);
    } else {
      // Show errors
      const errorMap: Record<string, string[]> = {};
      validation.errors.forEach(error => {
        // Parse field from error message or use question mapping
        // This is simplified - you'd need proper error parsing
      });
      setErrors(errorMap);
    }
  };

  if (!currentQuestion) {
    return (
      <div>
        <p>All questions answered!</p>
        <button onClick={handleSubmit}>Submit</button>
      </div>
    );
  }

  return (
    <div className="node-question-form">
      <h3>{currentQuestion.prompt}</h3>
      
      {currentQuestion.description && (
        <p className="description">{currentQuestion.description}</p>
      )}

      {currentQuestion.example && (
        <p className="example">Example: {JSON.stringify(currentQuestion.example)}</p>
      )}

      {renderQuestionInput(currentQuestion, answers[currentQuestion.field], handleAnswer)}

      {errors[currentQuestion.field] && (
        <div className="errors">
          {errors[currentQuestion.field].map((error, i) => (
            <p key={i} className="error">{error}</p>
          ))}
        </div>
      )}

      <div className="actions">
        <button onClick={handleSubmit}>Next</button>
      </div>
    </div>
  );
}

function renderQuestionInput(
  question: any,
  value: any,
  onChange: (field: string, value: any) => void
) {
  switch (question.type) {
    case 'string':
    case 'email':
      return (
        <input
          type={question.type === 'email' ? 'email' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(question.field, e.target.value)}
          placeholder={question.placeholder}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(question.field, parseFloat(e.target.value))}
        />
      );

    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value || false}
          onChange={(e) => onChange(question.field, e.target.checked)}
        />
      );

    case 'select':
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(question.field, e.target.value)}
        >
          <option value="">Select...</option>
          {question.options?.map((opt: any) => (
            <option key={opt.value} value={opt.value}>
              {opt.label || opt.value}
            </option>
          ))}
        </select>
      );

    case 'json':
      return (
        <textarea
          value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              onChange(question.field, JSON.parse(e.target.value));
            } catch {
              onChange(question.field, e.target.value);
            }
          }}
          rows={10}
        />
      );

    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={value || ''}
          onChange={(e) => onChange(question.field, e.target.value)}
        />
      );

    case 'credential':
      return (
        <CredentialSelector
          provider={question.credentialProvider}
          value={value}
          onChange={(credId) => onChange(question.field, credId)}
        />
      );

    default:
      return <input type="text" />;
  }
}
```

---

## Workflow Builder Integration

### Sequential Question Flow

```typescript
import {
  getNextQuestion,
  areAllRequiredQuestionsAnswered,
} from '../services/ai/node-question-order';
import { validateAnswer } from '../services/ai/node-question-validator';

export class NodeQuestionFlow {
  private nodeType: string;
  private answers: Record<string, any> = {};

  constructor(nodeType: string) {
    this.nodeType = nodeType;
  }

  async collectAnswers(): Promise<Record<string, any>> {
    while (true) {
      const nextQuestion = getNextQuestion(this.nodeType, this.answers);

      if (!nextQuestion) {
        // All questions answered
        break;
      }

      // Ask user the question
      const answer = await this.askQuestion(nextQuestion);

      // Validate
      const validation = validateAnswer(nextQuestion, answer);
      if (!validation.valid) {
        // Show errors and re-ask
        await this.showErrors(validation.errors);
        continue;
      }

      // Store answer
      this.answers[nextQuestion.field] = answer;

      // Check if we can proceed (all required answered)
      if (areAllRequiredQuestionsAnswered(this.nodeType, this.answers)) {
        const wantsOptional = await this.askOptionalFields();
        if (!wantsOptional) {
          break;
        }
      }
    }

    return this.answers;
  }

  private async askQuestion(question: any): Promise<any> {
    // Implementation depends on your UI framework
    // This is a placeholder
    return new Promise((resolve) => {
      // Show question in UI, wait for user input
      // resolve(userInput);
    });
  }

  private async showErrors(errors: string[]): Promise<void> {
    // Show errors to user
  }

  private async askOptionalFields(): Promise<boolean> {
    // Ask if user wants to fill optional fields
    return false;
  }
}
```

### Integration with Workflow Generation

```typescript
import { getOrderedQuestions } from './node-question-order';

export async function generateNodeConfig(
  nodeType: string,
  userPrompt: string,
  existingAnswers: Record<string, any> = {}
): Promise<Record<string, any>> {
  const questions = getOrderedQuestions(nodeType, existingAnswers);
  
  // Use AI to infer answers from prompt
  const inferredAnswers = await inferAnswersFromPrompt(
    nodeType,
    questions,
    userPrompt
  );

  // Merge with existing answers
  return {
    ...existingAnswers,
    ...inferredAnswers,
  };
}

async function inferAnswersFromPrompt(
  nodeType: string,
  questions: any[],
  prompt: string
): Promise<Record<string, any>> {
  // Use your AI service to extract answers from prompt
  // This is simplified
  const answers: Record<string, any> = {};

  for (const question of questions) {
    // Try to extract answer from prompt using AI
    const extracted = await extractFieldFromPrompt(question, prompt);
    if (extracted) {
      answers[question.field] = extracted;
    }
  }

  return answers;
}
```

---

## Migration from Old System

### Step 1: Update Imports

**Before:**
```typescript
import { getQuestionsForNode } from './node-input-questions';
```

**After:**
```typescript
import { getOrderedQuestions } from './node-question-order';
import { getQuestionsForNodeOrdered } from './node-question-adapter';
```

### Step 2: Update Function Calls

**Before:**
```typescript
const questions = getQuestionsForNode(node);
```

**After:**
```typescript
// Option 1: Use adapter (backward compatible)
const questions = getQuestionsForNodeOrdered(node, answeredFields);

// Option 2: Use new system directly
const nodeType = node.data?.type || node.type;
const questions = getOrderedQuestions(nodeType, answeredFields);
```

### Step 3: Handle Conditional Questions

**Before:**
```typescript
// Old system didn't handle dependencies
const questions = getQuestionsForNode(node);
questions.forEach(q => {
  // Show all questions
});
```

**After:**
```typescript
// New system filters by dependencies
const questions = getOrderedQuestions(nodeType, answeredFields);
// Only shows relevant questions
```

### Step 4: Add Validation

**Before:**
```typescript
// No built-in validation
```

**After:**
```typescript
import { validateAnswer } from './node-question-validator';

const validation = validateAnswer(question, answer);
if (!validation.valid) {
  // Handle errors
}
```

---

## Advanced Features

### Custom Question Types

```typescript
// Extend the question system for custom types
export interface CustomQuestionDefinition extends QuestionDefinition {
  customType?: 'fileUpload' | 'richText' | 'colorPicker';
  customConfig?: Record<string, any>;
}
```

### Question Dependencies with Multiple Conditions

```typescript
// The system supports complex dependencies
{
  field: 'properties',
  dependsOn: {
    field: 'operation',
    operator: 'in',
    value: ['create', 'update']
  },
  // This field only shows when operation is 'create' OR 'update'
}
```

### Dynamic Options

```typescript
// Options can be loaded dynamically
async function getDynamicOptions(
  question: QuestionDefinition,
  context: Record<string, any>
): Promise<Array<{ value: string; label: string }>> {
  if (question.field === 'resource' && question.nodeType === 'hubspot') {
    // Fetch from HubSpot API
    const resources = await hubspotApi.getResources();
    return resources.map(r => ({ value: r.id, label: r.name }));
  }
  return question.options || [];
}
```

### Question Hints and Helpers

```typescript
// Add contextual help
function getQuestionHelp(question: QuestionDefinition): string {
  if (question.field === 'cron') {
    return 'Use cron format: minute hour day month weekday. Example: 0 9 * * * (daily at 9 AM)';
  }
  if (question.field === 'spreadsheetId') {
    return 'Extract from Google Sheets URL: /d/SPREADSHEET_ID/edit';
  }
  return question.description || '';
}
```

---

## Testing

### Unit Tests

```typescript
import { getOrderedQuestions, getNextQuestion } from './node-question-order';

describe('Node Question Order', () => {
  test('should return questions in order', () => {
    const questions = getOrderedQuestions('hubspot', {});
    expect(questions[0].askOrder).toBeLessThan(questions[1].askOrder);
  });

  test('should filter by dependencies', () => {
    const questions = getOrderedQuestions('hubspot', {
      operation: 'create',
    });
    
    // Should include properties question
    const propertiesQ = questions.find(q => q.field === 'properties');
    expect(propertiesQ).toBeDefined();
    
    // Should not include objectId question
    const objectIdQ = questions.find(q => q.field === 'objectId');
    expect(objectIdQ).toBeUndefined();
  });

  test('should return next question', () => {
    const next = getNextQuestion('hubspot', {
      credentialId: 'cred_123',
      resource: 'contact',
    });
    
    expect(next?.field).toBe('operation');
  });
});
```

---

## Best Practices

1. **Always use `getOrderedQuestions` with current answers** - This ensures dependencies are respected
2. **Validate answers immediately** - Don't wait until submission
3. **Show progress indicators** - Let users know how many questions remain
4. **Save progress** - Allow users to come back later
5. **Provide examples** - Use the `example` field from questions
6. **Handle errors gracefully** - Show clear error messages
7. **Support keyboard navigation** - Make forms accessible

---

*For more details, see `node-questioning-architecture.md` and `node-question-order-usage.md`*
