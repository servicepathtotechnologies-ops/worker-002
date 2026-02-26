# Node Question System - Complete Summary

## 📋 Overview

A comprehensive, user-friendly node questioning system that provides:
- **Sequential ordering** - Questions asked in logical order
- **Dependency management** - Conditional fields show/hide automatically
- **Credential-first flow** - Credentials asked before configuration
- **Operation-first pattern** - Operation selected before dependent fields
- **Built-in validation** - Type checking and custom validation rules
- **Backward compatibility** - Works alongside existing system

## 📁 File Structure

```
worker/
├── src/services/ai/
│   ├── node-question-order.ts          # Core question ordering system
│   ├── node-question-adapter.ts        # Bridge to old system
│   ├── node-question-validator.ts      # Validation logic
│   └── node-input-questions.ts         # Legacy system (still supported)
│
└── docs/
    ├── node-questioning-architecture.md # Full architecture specs
    ├── node-question-order-usage.md     # API reference & examples
    ├── node-question-integration-guide.md # Integration examples
    ├── node-question-migration-guide.md # Migration from old system
    └── node-question-system-summary.md  # This file
```

## 🎯 Core Concepts

### 1. Question Order (askOrder)

Every question has an `askOrder` number that determines sequence:
- `0` = Credential (always first if needed)
- `1-2` = Operation (what to do)
- `3-5` = Core identifiers (which resource)
- `6-10` = Essential data (required fields)
- `11+` = Optional enhancements

### 2. Dependencies

Questions can depend on other questions:
```typescript
{
  field: 'objectId',
  dependsOn: {
    field: 'operation',
    operator: 'in',
    value: ['get', 'update', 'delete']
  }
}
// Only shows when operation is get, update, or delete
```

### 3. Conditional Required Fields

Fields can be conditionally required:
```typescript
{
  field: 'to',
  required: false,
  dependsOn: {
    field: 'operation',
    operator: 'equals',
    value: 'send'
  }
  // Required only when operation = 'send'
}
```

## 🚀 Quick Start

### Basic Usage

```typescript
import {
  getOrderedQuestions,
  getNextQuestion,
  areAllRequiredQuestionsAnswered,
} from './node-question-order';
import { validateAnswer } from './node-question-validator';

// Get all questions for a node
const questions = getOrderedQuestions('hubspot', {});

// Get next unanswered question
const next = getNextQuestion('hubspot', {
  credentialId: 'cred_123',
  resource: 'contact',
});

// Validate an answer
const validation = validateAnswer(next, userAnswer);

// Check if complete
const isComplete = areAllRequiredQuestionsAnswered('hubspot', answers);
```

### Integration Example

```typescript
// Sequential question flow
async function collectNodeConfig(nodeType: string) {
  const answers: Record<string, any> = {};

  while (true) {
    const nextQuestion = getNextQuestion(nodeType, answers);
    if (!nextQuestion) break;

    const answer = await askUser(nextQuestion);
    const validation = validateAnswer(nextQuestion, answer);

    if (validation.valid) {
      answers[nextQuestion.field] = answer;
    } else {
      showErrors(validation.errors);
    }
  }

  return answers;
}
```

## 📊 Supported Nodes

### ✅ Fully Configured (36 nodes)

**Triggers (5):**
- Webhook, Chat Trigger, Form, Schedule, HTTP Request

**AI (1):**
- AI Chat Model

**Logic (12):**
- If, Switch, Set, Function, Merge, Wait, Limit, Aggregate, Sort, Code, Function Item, NoOp

**CRM (6):**
- HubSpot, Zoho, Pipedrive, Notion, Airtable, ClickUp

**Communication (5):**
- Gmail, Slack, Telegram, Outlook, Google Calendar

**Social/Dev (7):**
- LinkedIn, GitHub, WhatsApp, Instagram, Facebook, Twitter, YouTube

## 🔧 Key Features

### 1. Credential-First Flow
```typescript
// Credential always asked first (askOrder: 0)
const questions = getOrderedQuestions('hubspot', {});
// questions[0] is credential selection
```

### 2. Operation-First Pattern
```typescript
// Operation always second (askOrder: 1 or 2)
const questions = getOrderedQuestions('gmail', { credentialId: 'cred_123' });
// questions[0] is operation selection
```

### 3. Automatic Dependency Filtering
```typescript
// Only relevant questions shown
const questions = getOrderedQuestions('hubspot', {
  operation: 'create', // objectId question won't appear
});
```

### 4. Built-in Validation
```typescript
// Type checking, format validation, custom rules
const validation = validateAnswer(question, answer);
// Returns: { valid, errors, warnings }
```

## 📚 Documentation Guide

### For Developers
1. **Start Here**: `node-question-order-usage.md` - API reference
2. **Integration**: `node-question-integration-guide.md` - Code examples
3. **Architecture**: `node-questioning-architecture.md` - Full specs

### For Migrators
1. **Migration**: `node-question-migration-guide.md` - Step-by-step guide
2. **Adapter**: Use `node-question-adapter.ts` for backward compatibility

## 🎨 Question Flow Examples

### Example 1: HubSpot Node

```
Step 1: [Credential] Which HubSpot connection? → User selects
Step 2: [Resource] Which object? → User selects "contact"
Step 3: [Operation] What to do? → User selects "create"
Step 4: [Properties] What properties? → User enters JSON
✅ Complete!
```

### Example 2: Gmail Node

```
Step 1: [Credential] Which Gmail account? → User selects
Step 2: [Operation] What to do? → User selects "send"
Step 3: [To] Who to send to? → User enters email
Step 4: [Subject] Subject? → User enters text
Step 5: [Body] Email body? → User enters text
✅ Complete!
```

### Example 3: Conditional Flow (HubSpot)

```
If operation = "get":
  → Shows: credential, resource, operation, objectId
  → Hides: properties, searchQuery

If operation = "create":
  → Shows: credential, resource, operation, properties
  → Hides: objectId, searchQuery

If operation = "search":
  → Shows: credential, resource, operation, searchQuery
  → Hides: objectId, properties
```

## 🔍 Dependency Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `operation === 'send'` |
| `notEquals` | Not equal | `operation !== 'count'` |
| `in` | Value in array | `operation in ['get', 'update']` |
| `exists` | Field has value | `media !== undefined` |
| `notExists` | Field is empty | `media === undefined` |

## ✅ Validation Types

- **Type validation**: string, number, boolean, email, json, datetime
- **Format validation**: email format, cron expression, phone (E.164), GitHub repo
- **Required validation**: Checks required fields and conditional requirements
- **Custom validation**: Field-specific rules (e.g., max length, min/max values)

## 🔄 Migration Path

### Phase 1: Parallel Run
- Use adapter for backward compatibility
- Test new system alongside old

### Phase 2: Incremental Migration
- Migrate nodes one by one
- Start with simple, then complex

### Phase 3: Full Migration
- Update all UI components
- Remove old system (optional)

## 🛠️ API Reference

### Core Functions

```typescript
// Get question configuration
getQuestionConfig(nodeType: string): NodeQuestionConfig | null

// Get ordered questions (filtered by dependencies)
getOrderedQuestions(nodeType: string, answeredFields: Record<string, any>): QuestionDefinition[]

// Get next unanswered question
getNextQuestion(nodeType: string, answeredFields: Record<string, any>): QuestionDefinition | null

// Check if all required questions answered
areAllRequiredQuestionsAnswered(nodeType: string, answeredFields: Record<string, any>): boolean
```

### Validation Functions

```typescript
// Validate single answer
validateAnswer(question: QuestionDefinition, answer: any): ValidationResult

// Validate all answers
validateAllAnswers(questions: QuestionDefinition[], answers: Record<string, any>): ValidationResult

// Specialized validators
validateCron(cron: string): ValidationResult
validatePhoneNumber(phone: string): ValidationResult
validateGitHubRepo(repo: string): ValidationResult
```

### Adapter Functions

```typescript
// Get questions (backward compatible)
getQuestionsForNodeOrdered(node: WorkflowNode, answeredFields: Record<string, any>): NodeQuestion[]

// Get next question (backward compatible)
getNextQuestionForNode(node: WorkflowNode, answeredFields: Record<string, any>): NodeQuestion | null

// Check credential requirement
requiresCredential(nodeType: string): boolean
getCredentialProvider(nodeType: string): string | null
```

## 📈 Benefits

1. **User-Friendly**: Questions asked in logical order
2. **Efficient**: Only relevant questions shown
3. **Accurate**: Built-in validation prevents errors
4. **Maintainable**: Centralized question definitions
5. **Extensible**: Easy to add new nodes or questions
6. **Type-Safe**: Full TypeScript support

## 🎯 Best Practices

1. **Always use `getOrderedQuestions` with current answers** - Respects dependencies
2. **Validate immediately** - Don't wait until submission
3. **Show progress** - Let users know how many questions remain
4. **Save progress** - Allow users to return later
5. **Provide examples** - Use question `example` field
6. **Handle errors gracefully** - Show clear error messages
7. **Support keyboard navigation** - Make forms accessible

## 🔮 Future Enhancements

- [ ] Dynamic options loading (fetch from APIs)
- [ ] Question hints and tooltips
- [ ] Multi-step wizards
- [ ] Question templates
- [ ] A/B testing for question order
- [ ] Analytics on question completion rates

## 📞 Support

- **Architecture**: See `node-questioning-architecture.md`
- **Usage**: See `node-question-order-usage.md`
- **Integration**: See `node-question-integration-guide.md`
- **Migration**: See `node-question-migration-guide.md`

---

**Version**: 1.0  
**Last Updated**: 2026-02-16  
**Status**: ✅ Production Ready
