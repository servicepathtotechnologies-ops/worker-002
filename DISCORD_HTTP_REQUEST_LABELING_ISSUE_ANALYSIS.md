# 🔍 Root Cause Analysis: HTTP Request Node Labeled as "Discord"

## Problem Statement

The UI shows an **HTTP Request node** labeled as **"Discord Http_api"**, but the user explicitly selected **Slack** in the variation. Additionally, **Slack is placed after log_output** instead of being the primary output.

## Root Cause #1: Frontend Node Type Conversion

**Location**: `ctrl_checks/src/lib/workflowValidation.ts` (lines 550-577)

**Issue**: Frontend validation converts unrecognized node types to `http_request` but **preserves the original label**.

```typescript
// Step 4: Last resort - use generic http_request
const httpRequestDefinition = NODE_TYPES.find((d: any) => d.type === 'http_request');
const preservedLabel = node.data?.label || node.label; // ⚠️ PRESERVES LABEL

if (node.data) {
    node.data.type = 'http_request'; // ✅ Converts type
    // ⚠️ BUT preserves label if it exists
    if (!preservedLabel) {
        node.data.label = httpRequestDefinition.label;
    }
}
```

**Flow**:
1. Backend creates `discord` node with `label: "Discord"`
2. Frontend doesn't recognize `discord` type (or type mismatch)
3. Frontend converts to `http_request` but keeps label "Discord"
4. **Result**: `http_request` node with label "Discord" → UI shows "Discord Http_api"

## Root Cause #2: Backend Creating Discord Node Despite Slack Being Explicit

**Location**: Multiple places in workflow generation pipeline

**Issue**: Despite explicit intent enforcement, `discord` node is still being created.

**Possible causes**:
1. **Duplicate extraction**: Two places extract explicit nodes with different logic
   - `generate-workflow.ts` uses `explicit-intent-extractor.ts` ✅
   - `workflow-pipeline-orchestrator.ts` uses inline logic ❌ (doesn't use utility)

2. **Blocked nodes not passed through**: `blockedNodeTypes` may not be reaching:
   - `node-resolver.resolvePrompt()`
   - `dslGenerator.generateDSL()`
   - `buildProductionWorkflow()`

3. **DSL generation adds both**: If both `slack_message` and `discord` are in `StructuredIntent.actions`, both get added to DSL outputs.

## Root Cause #3: Slack Placed After log_output

**Location**: `workflow-dsl-compiler.ts` (output node ordering)

**Issue**: `log_output` is auto-injected and placed first, then explicit outputs are added after.

**Flow**:
1. DSL generator auto-injects `log_output` (if no explicit outputs)
2. Then adds `slack_message` from DSL outputs
3. Compiler creates nodes in order: `log_output` → `slack_message`
4. **Result**: Slack appears after log_output instead of being primary output

## Where HTTP Request Node is Added

### 1. Frontend Validation (PRIMARY ISSUE)
- **File**: `ctrl_checks/src/lib/workflowValidation.ts`
- **Lines**: 550-577
- **When**: When frontend receives workflow from backend
- **Why**: Node type not recognized, falls back to `http_request`
- **Problem**: Preserves original label ("Discord")

### 2. Backend Node Resolution
- **File**: `worker/src/services/ai/node-resolver.ts`
- **When**: During intent extraction
- **Why**: Detects both Slack and Discord keywords
- **Problem**: Blocked nodes filter may not be applied

### 3. DSL Generation
- **File**: `worker/src/services/ai/workflow-dsl.ts`
- **When**: Converting StructuredIntent to DSL
- **Why**: Both nodes in `intent.actions`
- **Problem**: Blocked nodes filter may not run early enough

### 4. Intent-Aware Planner
- **File**: `worker/src/services/ai/intent-aware-planner.ts`
- **When**: Adding implicit nodes
- **Why**: May add Discord as alternative to Slack
- **Problem**: Doesn't check blocked nodes

## How Slack Gets Outside log_output

### Current Flow:
```
transformation → log_output → slack_message
```

### Expected Flow:
```
transformation → slack_message → log_output (optional)
```

**Why it happens**:
1. `log_output` is auto-injected first (DSL generator)
2. `slack_message` is added after (from DSL outputs)
3. Compiler creates nodes in DSL order
4. Edges connect sequentially: `transformation → log_output → slack_message`

## Debugging Checklist

### ✅ Check 1: Explicit Extraction Logs
Look for:
- `[ExplicitIntentExtractor] ✅ Extracted X explicit node(s)`
- `[ExplicitIntentExtractor] 🚫 Blocked X conflicting node(s)`

**If missing**: Extraction utility not being used

### ✅ Check 2: Blocked Nodes Passed Through
Look for:
- `[NodeResolver] 🚫 PHASE 2: Blocked conflicting node: discord`
- `[DSLGenerator] 🚫 PHASE 3: Blocked conflicting node in DSL outputs: discord`
- `[ProductionWorkflowBuilder] 🚫 PHASE 4: Removing conflicting node: discord`

**If missing**: Blocked nodes not reaching enforcement points

### ✅ Check 3: Node Type in Workflow
Check workflow JSON:
- `node.type` should be `"discord"` (not `"http_request"`)
- `node.data.type` should be `"discord"` (not `"http_request"`)

**If `http_request`**: Backend is creating wrong type
**If `discord`**: Frontend is converting it

### ✅ Check 4: Frontend Node Type Recognition
Check:
- Is `discord` in `NODE_TYPES` array in frontend?
- Is `discord` registered in `nodeTypes` map?

**If missing**: Frontend doesn't recognize `discord`, converts to `http_request`

## Fix Strategy

### Fix 1: Frontend Node Type Recognition
- **Add `discord` to frontend `NODE_TYPES`**
- **Register `discord` in `nodeTypes` map**
- **Prevent conversion of recognized node types**

### Fix 2: Unify Explicit Extraction
- **Make `workflow-pipeline-orchestrator.ts` use `explicit-intent-extractor.ts`**
- **Remove duplicate inline extraction logic**
- **Ensure blocked nodes are derived correctly**

### Fix 3: Pass Blocked Nodes Through Pipeline
- **Verify `blockedNodeTypes` reaches all enforcement points**
- **Add debug logging at each enforcement point**
- **Ensure filtering happens at each stage**

### Fix 4: Fix Output Node Ordering
- **Prioritize explicit output nodes over `log_output`**
- **Place `log_output` at the end (if needed)**
- **Ensure explicit outputs connect directly from transformation**

### Fix 5: Early Blocked Node Filtering
- **Filter blocked nodes in node resolution (earliest point)**
- **Filter blocked nodes in DSL generation (before adding to outputs)**
- **Filter blocked nodes in post-DSL validation (safety net)**

## Implementation Priority

1. **CRITICAL**: Fix frontend node type recognition (prevents conversion)
2. **CRITICAL**: Unify explicit extraction (ensures correct blocked nodes)
3. **HIGH**: Verify blocked nodes passed through (ensures enforcement)
4. **HIGH**: Fix output node ordering (ensures correct flow)
5. **MEDIUM**: Add debug logging (helps diagnose future issues)

## Verification

After fixes, verify:
- ✅ No `discord` node in workflow when Slack is explicit
- ✅ `slack_message` is primary output (before `log_output`)
- ✅ Node type is `slack_message` (not `http_request`)
- ✅ Label is "Slack" (not "Discord")
- ✅ Workflow flow: `transformation → slack_message → log_output`
