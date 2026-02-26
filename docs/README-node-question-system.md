# Node Question System - Documentation Index

## 🎯 Quick Navigation

**New to the system?** Start here → [System Summary](./node-question-system-summary.md)

**Want to use it?** → [Usage Guide](./node-question-order-usage.md)

**Need to integrate?** → [Integration Guide](./node-question-integration-guide.md)

**Migrating from old system?** → [Migration Guide](./node-question-migration-guide.md)

**Need full specs?** → [Architecture Document](./node-questioning-architecture.md)

---

## 📚 Documentation Files

### 1. [System Summary](./node-question-system-summary.md)
**Purpose**: High-level overview and quick reference  
**Audience**: Everyone  
**Read Time**: 5 minutes

**Contains:**
- Overview of the system
- Quick start examples
- Key features
- API reference summary
- Best practices

---

### 2. [Architecture Document](./node-questioning-architecture.md)
**Purpose**: Complete architectural specification  
**Audience**: Architects, Senior Developers  
**Read Time**: 30 minutes

**Contains:**
- Detailed question flow for all 36 nodes
- User-friendly ordering principles
- Dependency rules
- Credential flow logic
- Complete field definitions

**Sections:**
- Triggers (5 nodes)
- AI (1 node)
- Logic (12 nodes)
- CRM (6 nodes)
- Communication (5 nodes)
- Social/Dev (7 nodes)

---

### 3. [Usage Guide](./node-question-order-usage.md)
**Purpose**: API reference and code examples  
**Audience**: Developers  
**Read Time**: 15 minutes

**Contains:**
- API reference
- Code examples
- Question types
- Dependency operators
- Complete examples

**Key Functions:**
- `getOrderedQuestions()`
- `getNextQuestion()`
- `areAllRequiredQuestionsAnswered()`

---

### 4. [Integration Guide](./node-question-integration-guide.md)
**Purpose**: How to integrate into your codebase  
**Audience**: Developers  
**Read Time**: 20 minutes

**Contains:**
- API endpoint examples
- React component examples
- Workflow builder integration
- Advanced features
- Testing examples

**Sections:**
- Quick Integration
- API Integration
- UI Component Integration
- Workflow Builder Integration
- Advanced Features

---

### 5. [Migration Guide](./node-question-migration-guide.md)
**Purpose**: Migrate from old to new system  
**Audience**: Developers migrating  
**Read Time**: 15 minutes

**Contains:**
- Key differences
- Migration steps
- Code comparison examples
- Testing checklist
- Rollback plan

**Phases:**
1. Parallel Run
2. Update Node Types
3. Update UI Components
4. Add Validation

---

## 🗂️ Code Files

### Core Implementation

```
src/services/ai/
├── node-question-order.ts      # Main ordering system
├── node-question-validator.ts   # Validation logic
├── node-question-adapter.ts    # Backward compatibility bridge
└── node-input-questions.ts     # Legacy system (still supported)
```

### Key Exports

**From `node-question-order.ts`:**
- `getQuestionConfig()` - Get full config for a node
- `getOrderedQuestions()` - Get filtered, ordered questions
- `getNextQuestion()` - Get next unanswered question
- `areAllRequiredQuestionsAnswered()` - Check completion

**From `node-question-validator.ts`:**
- `validateAnswer()` - Validate single answer
- `validateAllAnswers()` - Validate all answers
- `validateCron()` - Validate cron expressions
- `validatePhoneNumber()` - Validate E.164 format
- `validateGitHubRepo()` - Validate repo format

**From `node-question-adapter.ts`:**
- `getQuestionsForNodeOrdered()` - Backward compatible questions
- `getNextQuestionForNode()` - Backward compatible next question
- `requiresCredential()` - Check if node needs credential
- `getCredentialProvider()` - Get credential provider

---

## 🚀 Quick Start

### 1. Import the System

```typescript
import {
  getOrderedQuestions,
  getNextQuestion,
  areAllRequiredQuestionsAnswered,
} from './services/ai/node-question-order';
import { validateAnswer } from './services/ai/node-question-validator';
```

### 2. Get Questions

```typescript
const questions = getOrderedQuestions('hubspot', {
  credentialId: 'cred_123',
  resource: 'contact',
});
```

### 3. Get Next Question

```typescript
const next = getNextQuestion('hubspot', answers);
if (next) {
  // Ask user this question
}
```

### 4. Validate Answers

```typescript
const validation = validateAnswer(question, answer);
if (!validation.valid) {
  // Show errors
}
```

---

## 📊 Supported Nodes

### ✅ All 36 Nodes Configured

| Category | Count | Nodes |
|----------|-------|-------|
| **Triggers** | 5 | Webhook, Chat Trigger, Form, Schedule, HTTP Request |
| **AI** | 1 | AI Chat Model |
| **Logic** | 12 | If, Switch, Set, Function, Merge, Wait, Limit, Aggregate, Sort, Code, Function Item, NoOp |
| **CRM** | 6 | HubSpot, Zoho, Pipedrive, Notion, Airtable, ClickUp |
| **Communication** | 5 | Gmail, Slack, Telegram, Outlook, Google Calendar |
| **Social/Dev** | 7 | LinkedIn, GitHub, WhatsApp, Instagram, Facebook, Twitter, YouTube |

---

## 🎯 Key Features

✅ **Sequential Ordering** - Questions asked in logical order  
✅ **Dependency Management** - Conditional fields show/hide automatically  
✅ **Credential-First** - Credentials asked before configuration  
✅ **Operation-First** - Operation selected before dependent fields  
✅ **Built-in Validation** - Type checking and format validation  
✅ **Backward Compatible** - Works with existing system  

---

## 📖 Reading Order

### For New Users
1. [System Summary](./node-question-system-summary.md) - Get overview
2. [Usage Guide](./node-question-order-usage.md) - Learn API
3. [Integration Guide](./node-question-integration-guide.md) - See examples

### For Architects
1. [Architecture Document](./node-questioning-architecture.md) - Full specs
2. [System Summary](./node-question-system-summary.md) - Quick reference

### For Migrators
1. [Migration Guide](./node-question-migration-guide.md) - Step-by-step
2. [Integration Guide](./node-question-integration-guide.md) - Code examples
3. [Usage Guide](./node-question-order-usage.md) - API reference

---

## 🔍 Common Tasks

### Get Questions for a Node
```typescript
const questions = getOrderedQuestions('hubspot', answeredFields);
```

### Get Next Question
```typescript
const next = getNextQuestion('hubspot', answeredFields);
```

### Validate Answer
```typescript
const validation = validateAnswer(question, answer);
```

### Check if Complete
```typescript
const complete = areAllRequiredQuestionsAnswered('hubspot', answers);
```

### Use Backward Compatible API
```typescript
import { getQuestionsForNodeOrdered } from './node-question-adapter';
const questions = getQuestionsForNodeOrdered(node, answers);
```

---

## 🎨 Example Flows

### HubSpot Node Flow
```
1. Credential → Select HubSpot connection
2. Resource → Select object (contact/company/deal/ticket)
3. Operation → Select action (get/create/update/delete/search)
4. Conditional → Show objectId OR properties OR searchQuery
5. Complete!
```

### Gmail Node Flow
```
1. Credential → Select Gmail account
2. Operation → Select action (send/list/get/search)
3. Conditional → Show to/subject/body (if send) OR query (if list/search) OR messageId (if get)
4. Complete!
```

---

## 🛠️ Development

### Adding a New Node

1. Add question config to `node-question-order.ts`
2. Follow the ordering pattern:
   - `askOrder: 0` = Credential (if needed)
   - `askOrder: 1-2` = Operation
   - `askOrder: 3-5` = Core identifiers
   - `askOrder: 6-10` = Essential data
   - `askOrder: 11+` = Optional fields

3. Add dependencies for conditional fields
4. Test with `getOrderedQuestions()`
5. Update documentation

### Testing

```typescript
import { getOrderedQuestions, getNextQuestion } from './node-question-order';

test('questions in order', () => {
  const questions = getOrderedQuestions('hubspot', {});
  expect(questions[0].askOrder).toBeLessThan(questions[1].askOrder);
});

test('conditional fields filtered', () => {
  const withCreate = getOrderedQuestions('hubspot', { operation: 'create' });
  const withGet = getOrderedQuestions('hubspot', { operation: 'get' });
  expect(withCreate.length).not.toBe(withGet.length);
});
```

---

## 📞 Support

**Questions?** Check the relevant guide:
- **Architecture questions** → Architecture Document
- **API questions** → Usage Guide
- **Integration questions** → Integration Guide
- **Migration questions** → Migration Guide

**Found a bug?** Check the code files for implementation details.

**Want to contribute?** Follow the development section above.

---

## 📝 Version History

- **v1.0** (2026-02-16) - Initial release
  - 36 nodes configured
  - Full dependency support
  - Built-in validation
  - Backward compatibility

---

**Last Updated**: 2026-02-16  
**Status**: ✅ Production Ready  
**Maintainer**: Workflow Builder Team
