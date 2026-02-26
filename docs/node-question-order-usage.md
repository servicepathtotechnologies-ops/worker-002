# Node Question Order System - Usage Guide

## Overview

The Node Question Order System provides a user-friendly, sequential questioning flow for all workflow nodes. Questions are asked in a natural order: **Credential → Operation → Core ID → Essential Data → Optional Fields**.

## Quick Start

```typescript
import { 
  getQuestionConfig, 
  getOrderedQuestions, 
  getNextQuestion,
  areAllRequiredQuestionsAnswered 
} from '../services/ai/node-question-order';

// Get all questions for a node type
const questions = getOrderedQuestions('hubspot', {});

// Get next unanswered question
const nextQuestion = getNextQuestion('hubspot', {
  credentialId: 'cred_123',
  resource: 'contact',
  operation: 'create'
});

// Check if all required questions are answered
const isComplete = areAllRequiredQuestionsAnswered('hubspot', {
  credentialId: 'cred_123',
  resource: 'contact',
  operation: 'create',
  properties: { email: 'test@example.com' }
});
```

## Question Flow Example

### HubSpot Node Flow

```typescript
// Step 1: Credential (askOrder: 0)
{
  id: 'hubspot_credential',
  field: 'credentialId',
  prompt: 'Which HubSpot connection should we use?',
  type: 'credential',
  required: true,
  askOrder: 0
}

// Step 2: Resource (askOrder: 1)
{
  id: 'hubspot_resource',
  field: 'resource',
  prompt: 'Which HubSpot object are we working with?',
  type: 'select',
  required: true,
  askOrder: 1,
  options: [
    { value: 'contact', label: 'Contact' },
    { value: 'company', label: 'Company' },
    // ...
  ]
}

// Step 3: Operation (askOrder: 2)
{
  id: 'hubspot_operation',
  field: 'operation',
  prompt: 'What should we do in HubSpot?',
  type: 'select',
  required: true,
  askOrder: 2,
  options: [
    { value: 'create', label: 'Create record' },
    { value: 'update', label: 'Update record' },
    // ...
  ]
}

// Step 4: Conditional fields (askOrder: 3+)
// Only shown if operation = 'create' or 'update'
{
  id: 'hubspot_properties',
  field: 'properties',
  prompt: 'What properties should we set?',
  type: 'json',
  required: false,
  askOrder: 5,
  dependsOn: {
    field: 'operation',
    operator: 'in',
    value: ['create', 'update']
  }
}
```

## Integration with Workflow Builder

### Example: Sequential Question Flow

```typescript
async function askNodeQuestions(nodeType: string) {
  const answeredFields: Record<string, any> = {};
  
  while (true) {
    const nextQuestion = getNextQuestion(nodeType, answeredFields);
    
    if (!nextQuestion) {
      // All questions answered
      break;
    }
    
    // Ask user the question
    const answer = await promptUser(nextQuestion);
    
    // Store answer
    answeredFields[nextQuestion.field] = answer;
    
    // Check if we're done
    if (areAllRequiredQuestionsAnswered(nodeType, answeredFields)) {
      // Optional: Ask if user wants to fill optional fields
      const wantsOptional = await askOptionalFields();
      if (!wantsOptional) break;
    }
  }
  
  return answeredFields;
}
```

### Example: Conditional Field Display

```typescript
function renderNodeForm(nodeType: string, currentValues: Record<string, any>) {
  const questions = getOrderedQuestions(nodeType, currentValues);
  
  return questions.map(q => {
    // Skip if dependency not met
    if (q.dependsOn) {
      const { field, operator, value } = q.dependsOn;
      const fieldValue = currentValues[field];
      
      let shouldShow = false;
      switch (operator) {
        case 'equals':
          shouldShow = fieldValue === value;
          break;
        case 'in':
          shouldShow = Array.isArray(value) && value.includes(fieldValue);
          break;
        // ... other operators
      }
      
      if (!shouldShow) return null;
    }
    
    return (
      <FormField
        key={q.id}
        label={q.prompt}
        type={q.type}
        required={q.required}
        value={currentValues[q.field]}
        onChange={(val) => updateField(q.field, val)}
        placeholder={q.placeholder}
        example={q.example}
        options={q.options}
      />
    );
  });
}
```

## Question Types

### Credential Type
```typescript
{
  type: 'credential',
  // Shows credential selector UI
  // Maps to credentialId field
}
```

### Select Type
```typescript
{
  type: 'select',
  options: [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' }
  ]
}
```

### JSON Type
```typescript
{
  type: 'json',
  // Shows JSON editor
  example: { key: 'value' }
}
```

### Code Type
```typescript
{
  type: 'code',
  // Shows code editor with syntax highlighting
}
```

### Email Type
```typescript
{
  type: 'email',
  // Shows email input with validation
}
```

### Datetime Type
```typescript
{
  type: 'datetime',
  // Shows datetime picker
  example: '2026-02-16T09:00:00Z'
}
```

## Dependency Operators

### equals
```typescript
dependsOn: {
  field: 'operation',
  operator: 'equals',
  value: 'send'
}
// Shows when operation === 'send'
```

### in
```typescript
dependsOn: {
  field: 'operation',
  operator: 'in',
  value: ['create', 'update']
}
// Shows when operation is 'create' OR 'update'
```

### notEquals
```typescript
dependsOn: {
  field: 'operation',
  operator: 'notEquals',
  value: 'count'
}
// Shows when operation !== 'count'
```

### exists
```typescript
dependsOn: {
  field: 'media',
  operator: 'exists'
}
// Shows when media field has a value
```

### notExists
```typescript
dependsOn: {
  field: 'media',
  operator: 'notExists'
}
// Shows when media field is empty
```

## Node Type Aliases

Some nodes have aliases for compatibility:

- `ai_chat_model` ↔ `chat_model`
- `set` ↔ `set_variable`
- `code` ↔ `javascript`

The system handles these automatically.

## Best Practices

### 1. Always Check Credential First
```typescript
const config = getQuestionConfig(nodeType);
if (config?.requiresCredential) {
  // Show credential selector first
  const credentialQuestion = config.questions.find(q => q.type === 'credential');
  // ... handle credential selection
}
```

### 2. Progressive Disclosure
```typescript
// Show only relevant questions based on current answers
const visibleQuestions = getOrderedQuestions(nodeType, currentValues);
// Render only visibleQuestions
```

### 3. Validation
```typescript
function validateAnswer(question: QuestionDefinition, answer: any): string[] {
  const errors: string[] = [];
  
  if (question.required && (answer === undefined || answer === null || answer === '')) {
    errors.push(`${question.prompt} is required`);
  }
  
  if (question.type === 'email' && answer && !isValidEmail(answer)) {
    errors.push('Invalid email address');
  }
  
  // ... more validation
  
  return errors;
}
```

### 4. Smart Defaults
```typescript
function getFieldValue(question: QuestionDefinition, currentValues: Record<string, any>) {
  // Use current value, or default, or example
  return currentValues[question.field] 
    ?? question.default 
    ?? (question.example && !question.required ? question.example : undefined);
}
```

## Complete Example: Gmail Node

```typescript
// Initial state
const gmailValues = {};

// Step 1: Credential (askOrder: 0)
const q1 = getNextQuestion('google_gmail', gmailValues);
// Returns: credential question
gmailValues.credentialId = 'cred_google_123';

// Step 2: Operation (askOrder: 1)
const q2 = getNextQuestion('google_gmail', gmailValues);
// Returns: operation question
gmailValues.operation = 'send';

// Step 3: To (askOrder: 2, dependsOn: operation='send')
const q3 = getNextQuestion('google_gmail', gmailValues);
// Returns: to question (because operation='send')
gmailValues.to = 'recipient@example.com';

// Step 4: Subject (askOrder: 3, dependsOn: operation='send')
const q4 = getNextQuestion('google_gmail', gmailValues);
gmailValues.subject = 'Welcome!';

// Step 5: Body (askOrder: 4, dependsOn: operation='send')
const q5 = getNextQuestion('google_gmail', gmailValues);
gmailValues.body = 'Hi {{$json.name}}, welcome!';

// All required questions answered
const isComplete = areAllRequiredQuestionsAnswered('google_gmail', gmailValues);
// Returns: true
```

## API Reference

### `getQuestionConfig(nodeType: string): NodeQuestionConfig | null`
Returns the full question configuration for a node type.

### `getOrderedQuestions(nodeType: string, answeredFields: Record<string, any>): QuestionDefinition[]`
Returns all questions for a node type, filtered by dependencies, sorted by askOrder.

### `getNextQuestion(nodeType: string, answeredFields: Record<string, any>): QuestionDefinition | null`
Returns the next unanswered question (required first, then optional).

### `areAllRequiredQuestionsAnswered(nodeType: string, answeredFields: Record<string, any>): boolean`
Checks if all required questions (respecting dependencies) are answered.

---

*For full architecture details, see `node-questioning-architecture.md`*
