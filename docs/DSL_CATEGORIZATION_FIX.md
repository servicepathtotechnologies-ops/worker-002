# DSL Categorization Fix ✅

## Issue Fixed

**Error**: `Invalid WorkflowDSL: WorkflowDSL missing outputs array or outputs is empty`

**Root Cause**: `google_gmail` with operation "execute" was being categorized as DATASOURCE instead of OUTPUT, causing the DSL to have 0 outputs.

---

## Problem Analysis

### What Happened

1. User prompt: "get data from google sheets, summarise it & send it to gmail"
2. Template matched: `AI_SUMMARY_PIPELINE` (expects outputs)
3. `google_gmail` was categorized as DATASOURCE (wrong!)
4. DSL ended up with 0 outputs
5. Compilation failed: "WorkflowDSL missing outputs array or outputs is empty"

### Why It Failed

The `determineCategoryFromSchema` function:
1. Checked operation "execute" against writeOperations list
2. "execute" was NOT in the list (only 'send', 'write', etc. were)
3. Fell through to registry category check
4. But the registry category check happened AFTER operation check
5. For ambiguous operations like "execute", it should prioritize registry category

---

## Fix Applied

### Change 1: Prioritize Registry Category for Communication Nodes

**File**: `worker/src/services/ai/workflow-dsl.ts`

**Fix**: Check registry category FIRST for communication nodes, before checking operations.

```typescript
// ✅ CRITICAL FIX: Check registry category FIRST for communication nodes
// This ensures nodes like google_gmail with ambiguous operations (e.g., "execute") 
// are correctly categorized as OUTPUT based on their registry category
const nodeDef = unifiedNodeRegistry.get(schema.type);
if (nodeDef) {
  const category = nodeDef.category;
  
  // ✅ CRITICAL FIX: For communication nodes, prioritize registry category
  // This handles ambiguous operations like "execute" for google_gmail
  if (category === 'communication') {
    return 'output'; // Communication nodes are always outputs
  }
}
```

### Change 2: Add "execute" to Write Operations

**Fix**: Added "execute" to the writeOperations list as a fallback.

```typescript
// ✅ CRITICAL FIX: Add "execute" as write operation for communication nodes
const writeOperations = ['write', 'create', 'update', 'append', 'send', 'notify', 'delete', 'remove', 'post', 'put', 'patch', 'publish', 'share', 'upload', 'submit', 'execute'];
```

---

## Result

✅ `google_gmail` with operation "execute" is now correctly categorized as OUTPUT
✅ DSL will have outputs array populated
✅ Workflow compilation will succeed

---

## Verification

- [x] TypeScript compilation passes
- [x] Communication nodes prioritized correctly
- [x] "execute" operation recognized as write operation
- [x] Registry category fallback works

---

**Status**: ✅ **FIXED**
