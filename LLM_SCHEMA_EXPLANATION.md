# 🔍 LLM Schema Verification - Explanation & Implementation Guide

## 📖 What is the Problem?

### Current Situation (❌ UNSAFE)

Right now, when the AI generates a workflow, it creates JSON like this:

```json
{
  "trigger": "manual_trigger",
  "steps": [
    {"id": "step1", "type": "gmail"},  // ❌ WRONG! Should be "google_gmail"
    {"id": "step2", "type": "custom"},  // ❌ WRONG! "custom" doesn't exist
    {"id": "step3", "type": "slack"}    // ❌ WRONG! Should be "slack_message"
  ]
}
```

**The Problem**:
- LLM can generate **ANY** string for `nodeType`
- Even though the prompt says "use only these types", the LLM can still invent types
- No programmatic enforcement - only text instructions
- Invalid types like "gmail", "custom", or made-up types can slip through

### What We Need (✅ SAFE)

We need the LLM to be **FORCED** to only use valid node types from `CANONICAL_NODE_TYPES`:

```json
{
  "trigger": "manual_trigger",  // ✅ Must be from enum
  "steps": [
    {"id": "step1", "type": "google_gmail"},  // ✅ Must be from enum
    {"id": "step2", "type": "slack_message"}  // ✅ Must be from enum
  ]
}
```

**The Solution**:
- Use **structured output** with **JSON schema**
- Constrain `nodeType` field to **enum** of `CANONICAL_NODE_TYPES`
- LLM **CANNOT** generate invalid types - it's programmatically blocked

---

## 🎯 What Needs to Be Implemented

### Step 1: Create JSON Schema with Enum Constraint

Create a JSON schema that defines the workflow structure, but with `nodeType` constrained to only valid types:

```typescript
// In workflow-builder.ts or new file: llm-schema-builder.ts

import { CANONICAL_NODE_TYPES } from '../../services/nodes/node-library';

function buildWorkflowStructureSchema() {
  return {
    type: "object",
    properties: {
      trigger: {
        type: "string",
        enum: CANONICAL_NODE_TYPES.filter(type => 
          // Filter to only trigger types
          type.includes('trigger') || 
          type === 'schedule' || 
          type === 'webhook' || 
          type === 'form'
        )
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            description: { type: "string" },
            type: {
              type: "string",
              enum: CANONICAL_NODE_TYPES  // ✅ ENUM CONSTRAINT - only valid types allowed
            }
          },
          required: ["id", "type"]
        }
      },
      connections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string" },
            target: { type: "string" },
            outputField: { type: "string" },
            inputField: { type: "string" }
          }
        }
      }
    },
    required: ["trigger", "steps"]
  };
}
```

### Step 2: Use Structured Output in LLM Call

Modify the `ollamaOrchestrator.processRequest()` call to use structured output:

**Current Code** (Line 4255):
```typescript
result = await ollamaOrchestrator.processRequest('workflow-generation', {
  prompt: structurePrompt,
  temperature: 0.2,
});
```

**New Code** (with structured output):
```typescript
const workflowSchema = buildWorkflowStructureSchema();

result = await ollamaOrchestrator.processRequest('workflow-generation', {
  prompt: structurePrompt,
  temperature: 0.2,
  response_format: {
    type: "json_object",
    schema: workflowSchema  // ✅ ENUM CONSTRAINT ENFORCED
  }
});
```

### Step 3: Implement Post-Processing Validation (RECOMMENDED for Ollama)

Since Ollama doesn't support structured output natively, use **post-processing validation** as the enforcement mechanism:

**Location**: `worker/src/services/ai/workflow-builder.ts`  
**After**: JSON parsing (around line 4324)

---

## 🔧 Implementation Steps

### Step 1: Check ollamaOrchestrator Capabilities

**File**: `worker/src/services/ai/ollama-orchestrator.ts`

Check if it supports:
- `response_format` parameter
- JSON schema validation
- Enum constraints

### Step 2: Create Schema Builder Function

**New File**: `worker/src/services/ai/llm-schema-builder.ts`

```typescript
import { CANONICAL_NODE_TYPES } from '../../services/nodes/node-library';

export function buildWorkflowStructureSchema() {
  // Get trigger types (nodes that can be triggers)
  const triggerTypes = CANONICAL_NODE_TYPES.filter(type => 
    type.includes('trigger') || 
    type === 'schedule' || 
    type === 'webhook' || 
    type === 'form' ||
    type === 'interval'
  );
  
  return {
    type: "object",
    properties: {
      trigger: {
        type: "string",
        enum: triggerTypes  // ✅ Only valid trigger types
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            description: { type: "string" },
            type: {
              type: "string",
              enum: CANONICAL_NODE_TYPES  // ✅ Only valid node types
            },
            config: { type: "object" }
          },
          required: ["id", "type"]
        }
      },
      connections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string" },
            target: { type: "string" },
            outputField: { type: "string" },
            inputField: { type: "string" }
          }
        }
      }
    },
    required: ["trigger", "steps"]
  };
}
```

### Step 3: Modify workflow-builder.ts

**File**: `worker/src/services/ai/workflow-builder.ts`  
**Line**: ~4255

**Add import**:
```typescript
import { buildWorkflowStructureSchema } from './llm-schema-builder';
```

**Modify LLM call**:
```typescript
// Build schema with enum constraints
const workflowSchema = buildWorkflowStructureSchema();

result = await ollamaOrchestrator.processRequest('workflow-generation', {
  prompt: structurePrompt,
  temperature: 0.2,
  response_format: {
    type: "json_object",
    schema: workflowSchema  // ✅ ENUM CONSTRAINT
  }
});
```

### Step 3 (RECOMMENDED): Add Post-Processing Validation

**This is the PRIMARY enforcement mechanism for Ollama** (since Ollama doesn't support structured output):

**File**: `worker/src/services/ai/workflow-builder.ts`  
**Location**: After JSON parsing (around line 4324)

**Add this validation**:

```typescript
// After parsing JSON (around line 4324)
parsed = JSON.parse(cleanJson);

// ✅ STRICT ARCHITECTURE: Validate all node types are canonical
// This is the PRIMARY enforcement since Ollama doesn't support structured output
import { CANONICAL_NODE_TYPES } from '../../services/nodes/node-library';

const invalidTypes: string[] = [];

// Validate trigger
if (parsed.trigger && !CANONICAL_NODE_TYPES.includes(parsed.trigger)) {
  invalidTypes.push(`trigger: "${parsed.trigger}"`);
}

// Validate all steps
if (parsed.steps && Array.isArray(parsed.steps)) {
  parsed.steps.forEach((step: any, index: number) => {
    const stepType = step.type || step.nodeType;
    if (stepType && !CANONICAL_NODE_TYPES.includes(stepType)) {
      invalidTypes.push(`step${index + 1} (${step.id || 'unknown'}): "${stepType}"`);
    }
  });
}

// ✅ FAIL-FAST: Throw error if any invalid types found
if (invalidTypes.length > 0) {
  const sampleTypes = CANONICAL_NODE_TYPES.slice(0, 10).join(', ');
  throw new Error(
    `[LLM Schema Validation] ❌ Invalid node types generated: ${invalidTypes.join(', ')}. ` +
    `Only canonical types from NodeLibrary are allowed. ` +
    `Valid types (sample): ${sampleTypes}... ` +
    `Total valid types: ${CANONICAL_NODE_TYPES.length}. ` +
    `This indicates LLM generated invalid node types. Workflow generation aborted.`
  );
}

console.log(`✅ [LLM Schema Validation] All node types are canonical (${parsed.steps?.length || 0} steps validated)`);
```

**This ensures**:
- Invalid node types are **BLOCKED** immediately after LLM generation
- Workflow generation **FAILS FAST** if LLM generates invalid types
- No invalid types can reach the rest of the system

---

## 📊 Benefits

### Before (❌ UNSAFE):
- LLM can generate: `"gmail"`, `"custom"`, `"made_up_type"`
- Only text instructions (can be ignored)
- Invalid types slip through → workflow fails at runtime

### After (✅ SAFE):
- LLM **CANNOT** generate invalid types (enum constraint)
- Programmatic enforcement (not just text)
- Invalid types **BLOCKED** at generation time
- Workflow guaranteed to use only valid node types

---

## 🚨 Important Notes

1. **Ollama Support**: Based on code review, Ollama does NOT natively support JSON schema/structured output. Options:
   - **Option A**: Add post-processing validation (RECOMMENDED - works with Ollama)
   - **Option B**: Use OpenAI API (if available) which supports JSON schema
   - **Option C**: Enhanced prompt engineering + strict validation (current approach, but stricter)

2. **Recommended Approach**: Since Ollama doesn't support structured output, use **post-processing validation** as the primary enforcement mechanism.

3. **Performance**: Post-processing validation is fast and ensures correctness without requiring LLM changes

---

## ✅ Summary

**What to Implement**:
1. Create `buildWorkflowStructureSchema()` function with enum constraints
2. Modify `ollamaOrchestrator.processRequest()` to use structured output
3. Add post-processing validation as safety net
4. Test with invalid node types to ensure they're blocked

**Result**: LLM **CANNOT** generate invalid node types - programmatically enforced!
