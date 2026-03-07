# Error Analysis: Invalid "default" Handles

## Error Summary

**Error Messages**:
```
Invalid source handle "default" for "schedule"
Invalid target handle "default" for "google_sheets"
Invalid source handle "default" for "google_sheets"
Invalid target handle "default" for "text_summarizer"
Invalid source handle "default" for "text_summarizer"
Invalid target handle "default" for "log_output"
Missing required transformation nodes: ai_chat_model
```

**Location**: `workflow-dsl-compiler.ts` - `buildLinearPipeline()` method

**Log Evidence**:
```
[WorkflowDSLCompiler] ✅ Edge created: schedule(default) -> google_sheets(default)
[WorkflowDSLCompiler] ✅ Edge created: google_sheets(default) -> text_summarizer(default)
[WorkflowDSLCompiler] ✅ Edge created: text_summarizer(default) -> email(default)
```

---

## Root Cause Analysis

### ✅ **Issue #1: Universal Handle Resolver Returns "default" for Nodes That Don't Have It**

**Problem**:
- The `UniversalHandleResolver.resolveSourceHandle()` and `resolveTargetHandle()` methods are returning `"default"` as the handle
- However, many nodes (like `schedule`, `google_sheets`, `text_summarizer`, `log_output`) **do NOT have "default" as a valid handle** in their registry definitions
- The resolver is falling back to `"default"` when it should be using the **first available port** from the registry

**Code Location**: `worker/src/core/utils/universal-handle-resolver.ts`

**Current Logic**:
```typescript
// ✅ PRIORITY 3: Use registry default (first available port)
if (validPorts.length > 0) {
  // Returns first port, but if no explicit port matches, might return "default"
  return {
    handle: validPorts[0], // This should work, but...
    valid: true
  };
}
```

**Issue**: The resolver might be returning `"default"` as a fallback before checking `validPorts[0]`, OR the registry doesn't have proper port definitions for these nodes.

---

### ✅ **Issue #2: Registry Port Definitions May Be Missing**

**Problem**:
- Nodes like `schedule`, `google_sheets`, `text_summarizer`, `log_output` might not have proper `outgoingPorts` and `incomingPorts` defined in the registry
- If ports are undefined or empty, the resolver falls back to hardcoded `"default"` or `"output"`/`"input"`

**Expected Behavior**:
- `schedule` should have `outgoingPorts: ['output']` or similar
- `google_sheets` should have `incomingPorts: ['input']` and `outgoingPorts: ['output']`
- `text_summarizer` should have `incomingPorts: ['input']` and `outgoingPorts: ['output']`
- `log_output` should have `incomingPorts: ['input']`

**If ports are missing**: The resolver can't determine valid handles and falls back to invalid `"default"`.

---

### ✅ **Issue #3: Missing Node Type (ai_chat_model vs text_summarizer)**

**Problem**:
- The system expects `ai_chat_model` but got `text_summarizer` instead
- This is a **node selection/categorization issue**, not a handle issue
- The DSL Generator or Intent-Aware Planner selected `text_summarizer` when it should have selected `ai_chat_model`

**Evidence**:
```
Missing required transformation nodes: ai_chat_model
```

**But workflow has**: `text_summarizer` (which is also an AI node, but not the expected one)

---

## Detailed Error Breakdown

### **Error 1: Invalid source handle "default" for "schedule"**

**What Happened**:
1. `buildLinearPipeline()` calls `createCompatibleEdge(triggerNode, firstDataSource, ...)`
2. `createCompatibleEdge()` calls `universalHandleResolver.resolveSourceHandle('schedule')`
3. Resolver returns `{ handle: 'default', valid: true }` (WRONG - schedule doesn't have "default")
4. Edge is created with `sourceHandle: 'default'`
5. Validation layer catches it: "Invalid source handle 'default' for 'schedule'"

**Why It Failed**:
- `schedule` node's `outgoingPorts` in registry might be:
  - `['output']` (not `['default']`)
  - `undefined` or `[]` (missing definition)
- Resolver should return `'output'` (first port), not `'default'`

---

### **Error 2: Invalid target handle "default" for "google_sheets"**

**What Happened**:
1. Edge creation: `schedule -> google_sheets`
2. `resolveTargetHandle('google_sheets')` returns `'default'`
3. But `google_sheets.incomingPorts` is probably `['input']` (not `['default']`)

**Why It Failed**:
- `google_sheets` node's `incomingPorts` in registry is `['input']`, not `['default']`
- Resolver should return `'input'` (first port), not `'default'`

---

### **Error 3-6: Same Pattern for Other Nodes**

- `google_sheets` → `text_summarizer`: Both need proper port resolution
- `text_summarizer` → `log_output`: Both need proper port resolution

**Pattern**: All nodes are getting `"default"` handles when they should get their **actual first port** from registry.

---

## Why This Is Happening

### **Hypothesis 1: Registry Port Definitions Are Missing**

**Check**: Do these nodes have `outgoingPorts` and `incomingPorts` defined in `unified-node-registry.ts`?

**If missing**: The resolver can't find valid ports and falls back to hardcoded `"default"`.

---

### **Hypothesis 2: Resolver Fallback Logic Is Wrong**

**Check**: In `universal-handle-resolver.ts`, what happens when:
- `validPorts.length === 0` (no ports defined)
- `validPorts` doesn't include the requested handle

**Current behavior**: Might be returning `"default"` as a hardcoded fallback.

**Expected behavior**: Should return `validPorts[0]` (first available port) OR return `{ valid: false }` if no ports exist.

---

### **Hypothesis 3: Port Names Don't Match**

**Check**: Registry might define ports as:
- `['output']` for schedule
- `['input']` for google_sheets

But resolver is looking for `'default'` and not finding it, so it returns `'default'` anyway (wrong fallback).

---

## Solution Requirements

### ✅ **Fix 1: Ensure Registry Has Port Definitions**

**Action**: Verify all nodes have proper `outgoingPorts` and `incomingPorts` in registry:
- `schedule`: `outgoingPorts: ['output']`
- `google_sheets`: `incomingPorts: ['input']`, `outgoingPorts: ['output']`
- `text_summarizer`: `incomingPorts: ['input']`, `outgoingPorts: ['output']`
- `log_output`: `incomingPorts: ['input']`

---

### ✅ **Fix 2: Fix Resolver Fallback Logic**

**Action**: In `universal-handle-resolver.ts`:
- **NEVER** return `"default"` as a hardcoded fallback
- **ALWAYS** return `validPorts[0]` (first available port) if ports exist
- **ALWAYS** return `{ valid: false }` if no ports exist (don't create invalid edges)

**Current code** (line 60):
```typescript
return {
  handle: 'output', // Fallback - WRONG! Should use validPorts[0]
  valid: false,
  reason: `Node type ${nodeType} not found in registry`
};
```

**Should be**:
```typescript
// If node not found, return invalid (don't guess)
return {
  handle: '', // Empty, not 'output'
  valid: false,
  reason: `Node type ${nodeType} not found in registry`
};
```

And when ports exist:
```typescript
// ✅ PRIORITY 3: Use registry default (first available port)
if (validPorts.length > 0) {
  return {
    handle: validPorts[0], // ✅ Use FIRST port, not 'default'
    valid: true,
    reason: `Using first available port: ${validPorts[0]}`
  };
}

// If no ports, return invalid
return {
  handle: '',
  valid: false,
  reason: `No outgoing ports defined for ${nodeType}`
};
```

---

### ✅ **Fix 3: Fix Node Selection (ai_chat_model vs text_summarizer)**

**Action**: Ensure the Intent-Aware Planner or DSL Generator selects `ai_chat_model` when the prompt requires it, not `text_summarizer`.

**This is a separate issue** from the handle problem, but it's also causing validation failures.

---

## Verification Steps

1. **Check Registry Port Definitions**:
   ```typescript
   const scheduleDef = unifiedNodeRegistry.get('schedule');
   console.log('schedule.outgoingPorts:', scheduleDef?.outgoingPorts);
   
   const sheetsDef = unifiedNodeRegistry.get('google_sheets');
   console.log('google_sheets.incomingPorts:', sheetsDef?.incomingPorts);
   console.log('google_sheets.outgoingPorts:', sheetsDef?.outgoingPorts);
   ```

2. **Check Resolver Behavior**:
   ```typescript
   const result = universalHandleResolver.resolveSourceHandle('schedule');
   console.log('Result:', result);
   // Should return: { handle: 'output', valid: true } (not 'default')
   ```

3. **Check Edge Creation**:
   - Verify `createCompatibleEdge()` is using resolver results correctly
   - Verify edges are created with valid handles from registry

---

## Summary

**Root Cause**: The `UniversalHandleResolver` is returning `"default"` as a handle for nodes that don't have `"default"` in their port definitions. The resolver should return the **first available port** from the registry (`validPorts[0]`), not a hardcoded `"default"`.

**Secondary Issue**: Node selection mismatch (`text_summarizer` vs `ai_chat_model`).

**Fix Required**: 
1. Ensure all nodes have proper port definitions in registry
2. Fix resolver to use `validPorts[0]` instead of hardcoded `"default"`
3. Fix node selection logic to match required nodes
