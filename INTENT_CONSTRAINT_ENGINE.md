# Intent Constraint Engine

## Overview

The `IntentConstraintEngine` generates a minimal node set from user intent by extracting required capabilities and mapping them to node types.

## Goal

Generate minimal node set from user intent - only include nodes that are explicitly required to satisfy the intent.

## Rules

1. ✅ **Extract required capabilities from normalized prompt**
2. ✅ **Map capabilities → node types using registry**
3. ✅ **Only allow nodes required to satisfy intent**
4. ✅ **Reject or remove extra nodes automatically**
5. ✅ **No loops unless explicitly requested**
6. ✅ **No repair nodes unless failure handling required**

## Example

**Input Intent:**
```typescript
{
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
}
```

**Output:**
```typescript
["manual_trigger", "google_sheets", "text_summarizer", "google_gmail"]
```

## API

### Function: `getRequiredNodes(intent) → NodeType[]`

```typescript
import { getRequiredNodes } from './intent-constraint-engine';
import { StructuredIntent } from './intent-structurer';

const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ],
  requires_credentials: ["google"]
};

const requiredNodes = getRequiredNodes(intent);
// Returns: ["manual_trigger", "google_sheets", "text_summarizer", "google_gmail"]
```

### Class: `IntentConstraintEngine`

```typescript
import { IntentConstraintEngine } from './intent-constraint-engine';

const engine = new IntentConstraintEngine();
const nodes = engine.getRequiredNodes(intent);
```

## Implementation Details

### 1. Trigger Mapping

Maps trigger types to node types:
- `manual_trigger` → `manual_trigger`
- `schedule` → `schedule`
- `webhook` → `webhook`
- `form` → `form`
- `chat_trigger` → `chat_trigger`

### 2. Action Mapping

Maps actions to node types using:
1. **Capability Resolution**: If action type is a capability (e.g., `summarize`), resolves to concrete node (e.g., `text_summarizer`)
2. **Node Type Normalization**: Normalizes action type to canonical node type
3. **Pattern Matching**: Matches common patterns (e.g., `google_sheets` → `google_sheets`)
4. **Direct Lookup**: Falls back to direct node library lookup

### 3. Capability Resolution

Uses `CapabilityResolver` to resolve capabilities:
- `summarize` / `summarization` → `text_summarizer` (or `ollama` if not available)
- `ai_processing` / `ai_service` → `ollama` (priority: ollama → openai → anthropic → gemini)
- `classification` → `ollama` (or other LLM)

### 4. Node Filtering

Filters out unnecessary nodes:

**Loops**: Excluded unless explicitly requested
- Checks for keywords: `loop`, `iterate`, `repeat`, `for each`, `foreach`
- Example: `loop` node excluded from "Get data from Sheets, summarize, send email"

**Repair Nodes**: Excluded unless failure handling required
- Checks for keywords: `error`, `failure`, `retry`, `handle`, `catch`
- Example: `error_handler` excluded from "Get data from Sheets, summarize, send email"

**Utility Nodes**: Excluded unless explicitly needed
- `set_variable`: Only if `variable` mentioned
- `format`: Only if `format` mentioned
- `parse`: Only if `parse` mentioned

### 5. Node Validation

Validates all node types:
- Normalizes node types using `normalizeNodeType`
- Checks existence in `NodeLibrary`
- Skips invalid node types with warning

## Supported Action Patterns

### Google Services
- `google_sheets` / `sheets` → `google_sheets`
- `gmail` / `google_mail` → `google_gmail`
- `google_drive` / `drive` → `google_drive`
- `google_calendar` / `calendar` → `google_calendar`

### AI/Processing
- `summarize` / `summary` → `text_summarizer` (via capability resolver)
- `classify` / `classification` → `ollama` (via capability resolver)
- `ai` / `llm` / `process` → `ollama` (via capability resolver)

### Communication
- `slack` → `slack_message`
- `discord` → `discord`
- `telegram` → `telegram`
- `email` (send) → `email` (SMTP) or `google_gmail` (if Gmail mentioned)

### Data Sources
- `airtable` → `airtable`
- `notion` → `notion`
- `database` / `db` → `database`
- `postgres` / `postgresql` → `postgresql`
- `mysql` → `mysql`
- `mongodb` / `mongo` → `mongodb`

### HTTP/API
- `http` / `api` / `request` → `http_request`

### Storage
- `s3` → `s3`
- `storage` → `storage`

## Usage Examples

### Example 1: Simple Data Flow
```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const nodes = getRequiredNodes(intent);
// Returns: ["manual_trigger", "google_sheets", "text_summarizer", "google_gmail"]
```

### Example 2: With Conditions
```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "gmail", operation: "send" }
  ],
  conditions: [
    { type: "if_else", condition: "value > 100" }
  ]
};

const nodes = getRequiredNodes(intent);
// Returns: ["manual_trigger", "google_sheets", "google_gmail", "if_else"]
```

### Example 3: With Loop (Explicit)
```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "loop", operation: "iterate" }, // Explicit loop
    { type: "gmail", operation: "send" }
  ]
};

const nodes = getRequiredNodes(intent);
// Returns: ["manual_trigger", "google_sheets", "loop", "google_gmail"]
```

### Example 4: With Error Handling
```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "error_handler", operation: "handle" }, // Explicit error handling
    { type: "gmail", operation: "send" }
  ]
};

const nodes = getRequiredNodes(intent);
// Returns: ["manual_trigger", "google_sheets", "error_handler", "google_gmail"]
```

## Integration

The `IntentConstraintEngine` can be integrated into the workflow generation pipeline:

```typescript
import { getRequiredNodes } from './intent-constraint-engine';
import { IntentStructurer } from './intent-structurer';

// In workflow pipeline
const structurer = new IntentStructurer();
const intent = await structurer.structureIntent(userPrompt);

// Get minimal node set
const requiredNodes = getRequiredNodes(intent);

// Use required nodes to constrain workflow generation
// Only generate workflows with these nodes
```

## Benefits

1. **Minimal Node Set**: Only includes nodes explicitly required
2. **Capability Resolution**: Automatically resolves capabilities to concrete nodes
3. **Smart Filtering**: Excludes unnecessary nodes (loops, repair nodes)
4. **Validation**: Ensures all nodes exist in library
5. **Deterministic**: Same intent always produces same node set
