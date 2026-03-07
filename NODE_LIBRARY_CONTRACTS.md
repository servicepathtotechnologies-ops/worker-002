# NodeLibrary Contracts & Type System Architecture

## Overview

This document describes the **contract-driven architecture** for node type resolution, data type inference, and terminal sink validation. All fixes are **universal** (apply to all workflows automatically) and **contract-based** (use NodeLibrary schemas, not heuristics).

---

## ✅ Completed Architectural Fixes

### 1. FinalWorkflowValidator: Terminal Sink Detection

**Problem**: Airtable and other storage/CRM nodes were incorrectly flagged as "not connected to any output" because the validator only recognized traditional notification nodes (gmail, email, slack) as valid endpoints.

**Solution**: Terminal sink detection now uses **NodeLibrary capabilities + config operation**:

- A node is treated as a **valid terminal sink** if:
  1. It's a traditional output (gmail, email, slack, etc.), **OR**
  2. Its `config.operation` is a write operation (`create`, `update`, `delete`, `append`, `insert`, `upsert`, `write`), **OR**
  3. Its NodeLibrary `capabilities` include any `*.write` / `database.write` / `crm.write` / `storage.write`.

**Location**: `src/services/ai/final-workflow-validator.ts` → `checkAllNodesConnectedToOutput()`

**Result**: ✅ Airtable with `operation: 'create'` is now always recognized as a valid final endpoint.

---

### 2. NodeDataTypeSystem: Prefer NodeLibrary Contracts

**Problem**: Type system used string heuristics instead of explicit NodeLibrary `nodeCapability` contracts, causing `(any) → (text,array)` mismatches.

**Solution**: `inferNodeTypeInfo()` now **prefers NodeLibrary `nodeCapability` contracts** over heuristics:

1. **First**: Check if `schema.nodeCapability` exists → use it directly (skip heuristics)
2. **Fallback**: Use heuristics for nodes without explicit contracts

**Location**: `src/services/ai/node-data-type-system.ts` → `inferNodeTypeInfo()`

**Result**: ✅ All AI nodes with `nodeCapability` contracts are typed correctly from the source of truth.

---

### 3. Type Compatibility: ANY as Wildcard

**Problem**: `checkTypeCompatibility()` rejected `ANY → [TEXT, ARRAY]` connections, causing failures when triggers (output: ANY) connected to AI nodes (input: [TEXT, ARRAY]).

**Solution**: `ANY` is now treated as a **wildcard** that's compatible with any specific type or union.

**Location**: `src/services/ai/node-data-type-system.ts` → `checkTypeCompatibility()`

**Result**: ✅ `trigger(any) → ai_chat_model(text|array)` connections are always compatible.

---

### 4. NodeLibrary: AI Node Contracts

**Problem**: AI nodes (`ollama`, `ai_chat_model`, `openai_gpt`, `anthropic_claude`, `google_gemini`) lacked explicit `nodeCapability` contracts.

**Solution**: Added `nodeCapability` to all AI node schemas:

```typescript
nodeCapability: {
  inputType: ['text', 'array'], // Can accept both text and array
  outputType: 'text',            // Produces text output
  acceptsArray: true,
  producesArray: false,
}
```

**Location**: `src/services/nodes/node-library.ts` → `createOllamaSchema()`, `createAiChatModelSchema()`, etc.

**Result**: ✅ Type system now reads I/O types from contracts, not heuristics.

---

### 5. Execution Order: Capability-Based Categorization

**Problem**: Airtable was mis-categorized as a `producer` instead of `output`, causing ordering violations.

**Solution**: `ExecutionOrderEnforcer.getNodeCategory()` now consults **NodeLibrary capabilities**:

- If a node has any `*.write` / `database.write` / `crm.write` / `storage.write` capability → categorize as **`OUTPUT`**.

**Location**: `src/services/ai/execution-order-enforcer.ts` → `getNodeCategory()`

**Result**: ✅ Airtable with write operations is correctly categorized as OUTPUT.

---

## 📋 How to Extend NodeLibrary

### Adding a New Node Type

1. **Create the schema** in `src/services/nodes/node-library.ts`:

```typescript
private createMyNodeSchema(): NodeSchema {
  return {
    type: 'my_node',
    label: 'My Node',
    category: 'my_category',
    description: 'Description of what this node does',
    configSchema: {
      required: ['field1'],
      optional: {
        field1: {
          type: 'string',
          description: 'Field description',
          examples: ['example'],
        },
      },
    },
    // ✅ CRITICAL: Add capabilities for terminal sink detection
    capabilities: ['my.capability', 'my.write'], // Use '*.write' for terminal sinks
    // ✅ CRITICAL: Add nodeCapability for type system
    nodeCapability: {
      inputType: ['text', 'array'], // What this node accepts
      outputType: 'text',            // What this node produces
      acceptsArray: true,
      producesArray: false,
    },
    // ... other fields
  };
}
```

2. **Register the schema** in `initializeSchemas()`:

```typescript
this.addSchema(this.createMyNodeSchema());
```

### Making a Node a Terminal Sink

To make a node recognized as a valid workflow endpoint (like Airtable):

1. **Add write capability**:
```typescript
capabilities: ['database.write', 'my.write'], // Any '*.write' capability
```

2. **OR ensure config.operation is a write operation**:
```typescript
configSchema: {
  optional: {
    operation: {
      type: 'string',
      examples: ['create', 'update', 'delete'], // Write operations
    },
  },
}
```

The `FinalWorkflowValidator` will automatically recognize it as a terminal sink.

---

## 🧪 Tests

### Unit Tests

- **`final-workflow-validator-terminal-sink.test.ts`**: Verifies Airtable is recognized as a terminal sink
- **`node-data-type-system-any.test.ts`**: Verifies `ANY → [TEXT, ARRAY]` compatibility
- **`auto-inject-no-output-producer.test.ts`**: Verifies auto-injection doesn't create `output → producer` edges

### Integration Tests

- **`validation-pipeline-integration.test.ts`**: Verifies validation pipeline handles custom nodes with `node.data.nodeType`

---

## 🔧 Feature Flags

- **`ENABLE_CANONICAL_RESOLVER`** (default: `true`): Controls use of canonical node type resolver in `src/utils/nodeTypeResolver.ts`

---

## 📝 Key Principles

1. **Single Source of Truth**: NodeLibrary schemas define all node behavior (I/O types, capabilities, categories)
2. **Contract-Driven**: Validators and type system prefer explicit contracts over heuristics
3. **Universal Fixes**: All changes apply to **all workflows automatically** (no workflow-specific patches)
4. **Backward Compatible**: Legacy heuristics remain as fallbacks for nodes without contracts

---

## 🚀 Next Steps

To add a new node type:

1. Add schema to `NodeLibrary` with `nodeCapability` contract
2. Add appropriate `capabilities` (include `*.write` if it's a terminal sink)
3. Run tests: `npm test`
4. The type system and validators will automatically use the new contract

---

## 📚 Related Files

- **NodeLibrary**: `src/services/nodes/node-library.ts`
- **Type System**: `src/services/ai/node-data-type-system.ts`
- **Final Validator**: `src/services/ai/final-workflow-validator.ts`
- **Execution Order**: `src/services/ai/execution-order-enforcer.ts`
- **Node Type Resolver**: `src/utils/nodeTypeResolver.ts`
