# Three-Component Prompt Analysis 🔍

## Your Analysis Summary

**Your Observation**:
- AI generates prompts by mixing user prompt with keywords
- Keywords help with node matching
- But operations (from node schemas) are NOT included in prompt generation
- **Your Suggestion**: Before prompt generation, AI should have THREE components:
  1. **User Prompt** (what user wants)
  2. **Keywords** (for node matching)
  3. **Operations** (from node schemas/code)

**Your Hypothesis**: If AI has all three components, it can:
- Make better decisions about which operations to use
- Improve categorization efficiency
- Reduce validation errors
- Match nodes more accurately

---

## Current Architecture Analysis

### 1. Where Keywords Are Used ✅

**Location**: Multiple places

**A. Intent Extraction (`intent-extractor.ts`)**:
- ❌ **NO keywords** in prompt
- Only extracts entities (verbs, sources, destinations)
- Prompt: Simple JSON extraction format

**B. Summarize Layer (`summarize-layer.ts`)**:
- ✅ **Keywords ARE included** (line 863-876)
- `buildClarificationPrompt()` filters relevant keywords
- Uses top 300 keywords for prompt generation
- Keywords help AI understand node types

**C. Keyword Node Selector (`keyword-node-selector.ts`)**:
- ✅ **Keywords used for matching**
- Matches user input to node keywords
- Uses registry keywords, labels, tags

**D. Workflow Builder (`workflow-builder.ts`)**:
- ✅ **Keywords in node reference**
- Node library includes keywords
- But operations are NOT explicitly listed

---

### 2. Where Operations Are Stored ✅

**Location**: Node Schemas

**A. Schema Structure**:
```typescript
// From node-library.ts
configSchema: {
  optional: {
    operation: {
      type: 'string',
      description: 'Operation to perform',
      examples: ['read', 'write', 'create', 'update'],
      default: 'read'
    }
  }
}
```

**B. Operations Available**:
- Stored in `schema.configSchema.optional.operation`
- Or `schema.configSchema.required` (if required)
- Examples: `['read', 'write', 'create', 'update', 'send', 'delete']`

**C. Operations Used For**:
- ✅ Categorization (DSL Generator)
- ✅ Validation (Output Validator)
- ✅ Question Generation (Comprehensive Questions Generator)
- ❌ **NOT used in prompt generation**

---

### 3. Current Prompt Generation Flow

**Stage 1: Intent Extraction**
```
User Prompt
  ↓
Intent Extractor
  ├─→ Extracts: verbs, sources, destinations
  └─→ ❌ NO keywords, ❌ NO operations
  ↓
SimpleIntent
```

**Stage 2: Intent-Aware Planner**
```
SimpleIntent
  ↓
Intent-Aware Planner
  ├─→ Maps entities → node types (uses keywords internally)
  ├─→ Infers operations from verbs (line 314-320)
  └─→ ❌ Operations NOT from schema, inferred from verbs
  ↓
StructuredIntent (with inferred operations)
```

**Stage 3: Summarize Layer (Prompt Enhancement)**
```
User Prompt
  ↓
Summarize Layer
  ├─→ ✅ Includes keywords (top 300)
  ├─→ ✅ Includes node types
  └─→ ❌ NO operations from schemas
  ↓
Enhanced Prompt (with keywords, NO operations)
```

**Stage 4: DSL Generator**
```
StructuredIntent
  ↓
DSL Generator
  ├─→ Uses operations for categorization
  ├─→ Operations come from StructuredIntent (inferred, not from schema)
  └─→ ❌ Operations NOT validated against schema operations
  ↓
WorkflowDSL
```

---

## Problem Analysis

### Current Issues

**1. Operations Are Inferred, Not Validated**:
- Intent-Aware Planner infers operations from verbs (line 314-320)
- Default fallback: `'execute'` (might not match schema)
- Operations are NOT checked against node's actual schema operations

**2. Keywords Are Used, But Operations Are Not**:
- Keywords help match nodes
- But operations are inferred separately
- No connection between keywords and operations

**3. Categorization Uses Inferred Operations**:
- DSL Generator uses inferred operations for categorization
- If operation is wrong → wrong categorization
- Example: `google_gmail` with "execute" → categorized as DATASOURCE (wrong!)

**4. Operations Not Available in Prompt Generation**:
- AI doesn't see what operations each node supports
- AI has to guess operations from verbs
- No validation against actual schema operations

---

## Your Proposed Solution Analysis

### ✅ Your Approach: Three-Component Prompt

**Components**:
1. **User Prompt** → What user wants
2. **Keywords** → For node matching
3. **Operations** → From node schemas

**Benefits**:
1. ✅ **Better Operation Selection**: AI sees actual operations, doesn't guess
2. ✅ **Improved Categorization**: Operations match schema → correct categorization
3. ✅ **Reduced Validation Errors**: Operations are valid from the start
4. ✅ **Better Node Matching**: Keywords + Operations = better matching

---

## Implementation Analysis

### Where Operations Should Be Added

**1. Intent Extraction Stage**:
```
Current:
User Prompt → SimpleIntent (verbs only)

Proposed:
User Prompt + Keywords + Operations → SimpleIntent
  ├─→ Verbs (from user prompt)
  ├─→ Keywords (for matching)
  └─→ Operations (from schemas, for validation)
```

**2. Intent-Aware Planner Stage**:
```
Current:
SimpleIntent → StructuredIntent (operations inferred)

Proposed:
SimpleIntent + Operations → StructuredIntent
  ├─→ Map entities → node types (keywords)
  ├─→ Select operations from schema (not inferred)
  └─→ Validate operations against schema
```

**3. Summarize Layer Stage**:
```
Current:
User Prompt + Keywords → Enhanced Prompt

Proposed:
User Prompt + Keywords + Operations → Enhanced Prompt
  ├─→ Keywords (for node matching)
  ├─→ Operations (for operation selection)
  └─→ Better prompt generation
```

---

## Technical Feasibility

### ✅ Operations Are Available

**Source**: Node Schemas
```typescript
// From node-library.ts
const schema = nodeLibrary.getSchema(nodeType);
const operationField = schema.configSchema.optional?.operation;
const operations = operationField?.examples || [operationField?.default];
```

**Extraction**:
```typescript
function extractOperationsForNode(nodeType: string): string[] {
  const schema = nodeLibrary.getSchema(nodeType);
  const operationField = schema.configSchema.optional?.operation;
  
  if (operationField?.examples) {
    return operationField.examples;
  }
  if (operationField?.default) {
    return [operationField.default];
  }
  return [];
}
```

**Format for Prompt**:
```typescript
function formatOperationsForPrompt(nodeType: string): string {
  const operations = extractOperationsForNode(nodeType);
  return `${nodeType}: [${operations.join(', ')}]`;
}
```

---

## Comparison: Current vs. Proposed

### Current Flow (Operations Inferred)
```
User Prompt: "get data from google sheets, summarise it & send it to gmail"
  ↓
Intent Extractor
  ├─→ Verbs: ["get", "summarise", "send"]
  └─→ NO operations
  ↓
Intent-Aware Planner
  ├─→ Maps "google sheets" → google_sheets (keywords)
  ├─→ Maps "gmail" → google_gmail (keywords)
  ├─→ Infers operation: "read" (from verb "get")
  └─→ Infers operation: "execute" (default fallback for "send")
  ↓
StructuredIntent
  ├─→ google_sheets: operation="read" ✅ (correct)
  └─→ google_gmail: operation="execute" ❌ (wrong! should be "send")
  ↓
DSL Generator
  ├─→ "execute" not in writeOperations → categorized as DATASOURCE ❌
  └─→ Error: "missing outputs array"
```

### Proposed Flow (Operations from Schema)
```
User Prompt: "get data from google sheets, summarise it & send it to gmail"
  ↓
Intent Extractor (with Operations)
  ├─→ Verbs: ["get", "summarise", "send"]
  ├─→ Keywords: ["google_sheets", "google_gmail"]
  └─→ Operations: 
      ├─→ google_sheets: ["read", "write", "getMany"]
      └─→ google_gmail: ["send", "reply", "forward"]
  ↓
Intent-Aware Planner (with Operations)
  ├─→ Maps "google sheets" → google_sheets
  ├─→ Maps "gmail" → google_gmail
  ├─→ Selects operation: "read" (from schema, matches verb "get") ✅
  └─→ Selects operation: "send" (from schema, matches verb "send") ✅
  ↓
StructuredIntent
  ├─→ google_sheets: operation="read" ✅ (from schema)
  └─→ google_gmail: operation="send" ✅ (from schema)
  ↓
DSL Generator
  ├─→ "send" in writeOperations → categorized as OUTPUT ✅
  └─→ Success: outputs array populated
```

---

## Benefits of Your Approach

### ✅ 1. Accuracy Improvement
- Operations come from schemas (valid)
- No guessing from verbs
- Better matching to user intent

### ✅ 2. Categorization Improvement
- Operations match schema → correct categorization
- No more "execute" → DATASOURCE errors
- Better DSL generation

### ✅ 3. Validation Improvement
- Operations are valid from the start
- No need for post-validation fixes
- Fewer errors in workflow generation

### ✅ 4. User Experience Improvement
- Better workflow generation
- Fewer errors
- More accurate node selection

---

## Potential Challenges

### ⚠️ 1. Prompt Size
- Adding operations to all nodes might increase prompt size
- Solution: Filter relevant operations (only for matched nodes)

### ⚠️ 2. Operation Selection Logic
- How does AI select from multiple operations?
- Solution: Match verb to operation (e.g., "send" → "send", "get" → "read")

### ⚠️ 3. Schema Consistency
- Not all nodes have operations in schema
- Solution: Use defaults or infer from category

---

## Recommendation

### ✅ Your Approach is EXCELLENT

**Why**:
1. ✅ Operations are available in schemas
2. ✅ Keywords are already used
3. ✅ Combining them improves accuracy
4. ✅ Reduces validation errors
5. ✅ Better categorization

**Implementation Priority**:
1. **High**: Add operations to Intent-Aware Planner (most critical)
2. **Medium**: Add operations to Summarize Layer (improves prompt generation)
3. **Low**: Add operations to Intent Extractor (optional, less critical)

**Expected Impact**:
- ✅ Fixes categorization errors (like "execute" → DATASOURCE)
- ✅ Improves operation selection accuracy
- ✅ Reduces validation errors
- ✅ Better workflow generation

---

## Conclusion

**Your analysis is CORRECT** ✅

**Current State**:
- Keywords: ✅ Used in prompts
- Operations: ❌ NOT used in prompts (inferred separately)

**Your Proposal**:
- Keywords: ✅ Continue using
- Operations: ✅ Add to prompts (from schemas)

**Result**:
- Better operation selection
- Improved categorization
- Reduced validation errors
- Better workflow generation

**Recommendation**: **Implement your approach** - it's a significant improvement! 🎯
