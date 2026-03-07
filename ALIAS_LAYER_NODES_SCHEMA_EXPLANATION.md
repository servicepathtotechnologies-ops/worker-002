# Alias Layer, Nodes, and Schema Architecture - Detailed Explanation

## Overview

The system uses a **three-layer architecture** to handle node types:
1. **Alias Layer** - User-friendly names and variations
2. **Node Schemas** - Complete definitions of node capabilities
3. **Canonical Types** - Official, standardized node type names

This architecture solves the problem where users/AI generate node types like `"gmail"`, `"typeform"`, or `"ai"`, but the system needs to map them to canonical types like `"google_gmail"`, `"form"`, or `"ai_chat_model"`.

---

## 1. Alias Layer

### Purpose

The **Alias Layer** provides a mapping between **user-friendly names** and **canonical node types**. It allows the system to accept multiple variations of the same node type.

### How It Works

**Location**: `worker/src/services/nodes/node-type-resolver.ts`

**Structure**:
```typescript
const NODE_TYPE_ALIASES: Record<string, string[]> = {
  // Canonical Type → Array of Aliases
  'google_gmail': ['gmail', 'google_mail', 'email', 'gmail_send', 'send_email', 'mail'],
  'form': ['form_trigger', 'form_submission', 'typeform'],  // ← "typeform" is an alias!
  'ai_chat_model': ['chat_model', 'ai_chat', 'llm_chat', 'conversation'],
  'http_request': ['http', 'api', 'request', 'fetch', 'api_call'],
  // ... 50+ more mappings
};
```

**Reverse Map**:
```typescript
const ALIAS_TO_CANONICAL: Map<string, string> = new Map();
// Maps: "gmail" → "google_gmail"
// Maps: "typeform" → "form"
// Maps: "api" → "http_request"
```

### Why Aliases Exist

1. **User-Friendly Names**: Users naturally say "gmail" not "google_gmail"
2. **AI Generation**: LLMs generate variations like "typeform", "api", "gmail"
3. **Flexibility**: Multiple ways to refer to the same node
4. **Backward Compatibility**: Support old naming conventions

### Example Flow

```
User/AI Input: "typeform"
    ↓
Alias Resolver: "typeform" → "form" (canonical)
    ↓
Node Library: Lookup schema for "form"
    ↓
Schema Found: Returns complete node definition
```

---

## 2. Node Schemas

### Purpose

**Node Schemas** are complete definitions that describe:
- What the node does
- What configuration it needs
- What data it accepts/produces
- How AI should select it
- Validation rules

### Schema Structure

**Location**: `worker/src/services/nodes/node-library.ts`

**Interface**:
```typescript
export interface NodeSchema {
  type: string;                    // Canonical type name (e.g., "form", "google_gmail")
  label: string;                   // Human-readable label
  category: string;                // Category (triggers, actions, transformations)
  description: string;              // What this node does
  configSchema: ConfigSchema;      // Required/optional configuration fields
  aiSelectionCriteria: {            // When AI should use this node
    whenToUse: string[];
    whenNotToUse: string[];
    keywords: string[];
    useCases: string[];
  };
  commonPatterns: CommonPattern[];  // Common usage patterns
  validationRules: ValidationRule[]; // Validation rules
  capabilities?: string[];          // Capability tags (e.g., ["email.send"])
  keywords?: string[];              // Search keywords for pattern matching
  nodeCapability?: {                // Data type capabilities
    inputType: 'text' | 'array' | 'object';
    outputType: 'text' | 'array' | 'object';
  };
}
```

### Example Schema

```typescript
{
  type: "form",                    // ← Canonical type
  label: "Form Trigger",
  category: "triggers",
  description: "Triggers workflow when a form is submitted",
  configSchema: {
    required: ["formId"],
    optional: {
      formId: { type: "string", description: "Form ID" }
    }
  },
  keywords: ["form", "typeform", "form_submission"],  // ← Pattern matching keywords
  capabilities: ["form.trigger", "form.read"],
  // ...
}
```

### Schema Registration

Schemas are registered in `NodeLibrary`:
```typescript
class NodeLibrary {
  private schemas: Map<string, NodeSchema> = new Map();
  
  addSchema(schema: NodeSchema): void {
    this.schemas.set(schema.type, schema);  // Key = canonical type
  }
}
```

---

## 3. Canonical Types

### Purpose

**Canonical Types** are the **official, standardized names** for node types. They are:
- Unique identifiers in the system
- Used in capability registry
- Used in workflow storage
- Used in execution engine

### Examples

| Alias (User Input) | Canonical Type (System) |
|-------------------|------------------------|
| `"gmail"` | `"google_gmail"` |
| `"typeform"` | `"form"` |
| `"api"` | `"http_request"` |
| `"ai"` | `"ai_chat_model"` |
| `"sheets"` | `"google_sheets"` |

### Why Canonical Types Matter

1. **Single Source of Truth**: One canonical type = one schema
2. **Consistency**: All systems use the same name
3. **Validation**: Capability registry validates against canonical types
4. **Execution**: Execution engine looks up by canonical type

---

## 4. Resolution Flow

### Complete Resolution Process

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: User/AI Input                                       │
│ Input: "typeform"                                            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Alias Resolution (NodeTypeResolver)                 │
│ Check ALIAS_TO_CANONICAL map                                │
│ "typeform" → "form" (canonical)                             │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Schema Lookup (NodeLibrary.getSchema)               │
│ Lookup: schemas.get("form")                                 │
│ Returns: NodeSchema with type="form"                        │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Use Canonical Type                                  │
│ Use schema.type = "form" (NOT "typeform")                   │
│ Add to required nodes, validate, execute                     │
└─────────────────────────────────────────────────────────────┘
```

### Resolution Methods (Priority Order)

1. **Direct Lookup**: `schemas.get("form")` → Fast path for canonical types
2. **Alias Resolution**: `"typeform"` → `"form"` via `ALIAS_TO_CANONICAL`
3. **Pattern Matching**: Search `keywords` and `commonPatterns` in schemas
4. **Fuzzy Matching**: Levenshtein distance similarity (>0.8)

---

## 5. Pattern Matching vs Alias Resolution

### Pattern Matching

**Purpose**: Find schemas by searching keywords/patterns (for operation names like "summarize")

**Example**:
```typescript
// User says: "summarize text"
// Pattern matching searches all schemas for keyword "summarize"
// Finds: text_summarizer schema
```

**When Used**:
- Operation names (not node types)
- Fuzzy matching when alias doesn't exist
- Fallback when exact match fails

### Alias Resolution

**Purpose**: Direct mapping from alias to canonical type

**Example**:
```typescript
// User says: "typeform"
// Alias map: "typeform" → "form"
// Direct lookup: schemas.get("form")
```

**When Used**:
- Known aliases (defined in `NODE_TYPE_ALIASES`)
- Fast, deterministic resolution
- **Preferred over pattern matching** for node types

---

## 6. Why This Architecture?

### Problem Solved

**Before**: 
- User says "gmail" → System can't find it → Error ❌
- AI generates "typeform" → System can't find it → Error ❌

**After**:
- User says "gmail" → Alias resolves to "google_gmail" → Schema found → Success ✅
- AI generates "typeform" → Alias resolves to "form" → Schema found → Success ✅

### Benefits

1. **User-Friendly**: Accept natural language names
2. **AI-Compatible**: Handle LLM variations
3. **Maintainable**: Single canonical type = single schema
4. **Extensible**: Easy to add new aliases
5. **Type-Safe**: Canonical types ensure consistency

---

## 7. Critical Implementation Details

### ✅ Always Use Canonical Types After Resolution

**Wrong**:
```typescript
const schema = nodeLibrary.getSchema("typeform");
if (schema) {
  return ["typeform"];  // ❌ Using input type
}
```

**Correct**:
```typescript
const schema = nodeLibrary.getSchema("typeform");
if (schema) {
  return [schema.type];  // ✅ Using canonical type ("form")
}
```

### ✅ Resolution Order Matters

1. **Direct lookup** (fastest)
2. **Alias resolution** (deterministic)
3. **Pattern matching** (flexible, but slower)
4. **Fuzzy matching** (last resort)

### ✅ Schema.type is Authoritative

When `getSchema()` returns a schema:
- `schema.type` contains the **canonical name**
- Always use `schema.type`, never the input type
- This ensures consistency across the system

---

## 8. Real-World Example

### Scenario: User wants to use Typeform

**User Prompt**: "Trigger on Typeform submission"

**Flow**:
1. **Intent Parser**: Extracts `"typeform"` as trigger type
2. **Alias Resolution**: `"typeform"` → `"form"` (canonical)
3. **Schema Lookup**: `getSchema("form")` → Returns form schema
4. **Canonical Type**: Use `schema.type = "form"` (NOT "typeform")
5. **Validation**: Check capability registry for `"form"` → ✅ Found
6. **Workflow Build**: Create node with `type: "form"`
7. **Execution**: Execute using form trigger schema

**Result**: ✅ Workflow works correctly with canonical type

---

## 9. Summary

| Layer | Purpose | Example |
|-------|---------|---------|
| **Alias Layer** | Map user-friendly names to canonical types | `"typeform"` → `"form"` |
| **Node Schema** | Complete node definition | `{ type: "form", configSchema: {...}, ... }` |
| **Canonical Type** | Official system name | `"form"` |

**Key Principle**: 
- **Aliases** = User input (flexible)
- **Schemas** = System knowledge (complete)
- **Canonical Types** = System identifiers (consistent)

**Always**: Resolve alias → Get schema → Use `schema.type` (canonical)
