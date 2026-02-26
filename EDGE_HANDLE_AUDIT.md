# Edge Handle ID Audit Report

## Summary

Audit of edge creation logic to ensure all nodes expose consistent handle IDs:
- Source handle ID = `"output"`
- Target handle ID = `"input"`

## Frontend Node Handles

### WorkflowNode Component
**File**: `ctrl_checks/src/components/workflow/WorkflowNode.tsx`

✅ **Target Handle (Input)**:
- Line 233-239: `id="input"`, `type="target"`, `Position.Top`
- Used for: All non-AI nodes

✅ **Source Handle (Output)**:
- Line 344-348: `id="output"`, `type="source"`, `Position.Bottom`
- Used for: All non-special nodes

**Special Cases**:
- `if_else`: `id="true"` and `id="false"` (source handles)
- `switch`: Dynamic case values (source handles)
- `ai_agent`: Multiple input handles (`userInput`, `chat_model`, `memory`, `tool`)

### FormTriggerNode Component
**File**: `ctrl_checks/src/components/workflow/FormTriggerNode.tsx`

✅ **Target Handle (Input)**:
- Line 79-85: `id="input"`, `type="target"`, `Position.Top`

✅ **Source Handle (Output)**:
- Line 126-132: `id="output"`, `type="source"`, `Position.Bottom`

## Backend Edge Creation

### WorkflowStructureBuilder
**File**: `worker/src/services/ai/workflow-structure-builder.ts`

✅ **Connection Creation**:
- Line 627-628: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 650-651: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 695-696: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 719-720: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 760-761: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 785-786: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 906-907: `sourceOutput: 'output'`, `targetInput: 'input'`

### WorkflowPipelineOrchestrator
**File**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`

✅ **Edge Normalization**:
- Line 396-401: Uses `validateAndFixEdgeHandles()` to normalize `conn.sourceOutput` and `conn.targetInput`
- Line 408-409: Sets `sourceHandle` and `targetHandle` on edge

### RepairEngine
**File**: `worker/src/services/ai/repair-engine.ts`

✅ **Connection Creation**:
- Line 152: `sourceOutput: 'output'`
- Line 255-256: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 271-272: `sourceOutput: 'true'` (if_else special case)
- Line 322-323: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 330-331: `sourceOutput: 'output'`, `targetInput: 'input'`
- Line 361-362: `sourceOutput: 'output'`, `targetInput: 'input'`

⚠️ **Potential Issue**: Line 153, 256, 323, 331, 362 use `getDefaultInputField()` which may not always return `'input'`

### WorkflowBuilder
**File**: `worker/src/services/ai/workflow-builder.ts`

✅ **Edge Creation**:
- Line 10766-10771: Uses `validateAndFixEdgeHandles()` to normalize handles
- Line 10782-10783: Sets `sourceHandle` and `targetHandle` on edge

### ConnectionBuilder
**File**: `worker/src/services/connection-builder.ts`

✅ **Edge Creation**:
- Line 275-280: Uses `validateAndFixEdgeHandles()` to normalize handles
- Line 288-289: Sets `sourceHandle` and `targetHandle` on edge

## Handle Registry

**File**: `worker/src/core/utils/node-handle-registry.ts`

✅ **Default Handles**:
- Line 173-183: `getDefaultSourceHandle()` returns `'output'` (or first output handle)
- Line 188-198: `getDefaultTargetHandle()` returns `'input'` (or first input handle)

✅ **Normalization**:
- Line 350-363: `validateAndFixEdgeHandles()` normalizes handles using `normalizeHandleId()`
- Line 222-238: `normalizeHandleId()` maps common field names to React handle IDs

## Issues Found

### Issue 1: RepairEngine uses getDefaultInputField()
**Location**: `worker/src/services/ai/repair-engine.ts`

**Problem**: 
- Line 153, 256, 323, 331, 362 use `getDefaultInputField()` which may return different values than `'input'`
- This could cause mismatches if the function returns a field name instead of the handle ID

**Fix Required**: Replace `getDefaultInputField()` calls with `'input'` directly, or ensure it always returns `'input'` for standard nodes.

## Recommendations

1. ✅ **Standardize on `'input'` and `'output'`**: All standard nodes should use these handle IDs
2. ✅ **Use `validateAndFixEdgeHandles()`**: All edge creation should use this function for normalization
3. ⚠️ **Fix RepairEngine**: Replace `getDefaultInputField()` with `'input'` or ensure it returns `'input'` for standard nodes
4. ✅ **Document Special Cases**: if_else, switch, and ai_agent have special handle requirements

## Verification Checklist

- [x] Frontend WorkflowNode exposes `id="input"` and `id="output"`
- [x] Frontend FormTriggerNode exposes `id="input"` and `id="output"`
- [x] Backend WorkflowStructureBuilder uses `sourceOutput: 'output'` and `targetInput: 'input'`
- [x] Backend WorkflowPipelineOrchestrator normalizes handles correctly
- [x] Backend WorkflowBuilder normalizes handles correctly
- [x] Backend ConnectionBuilder normalizes handles correctly
- [ ] Backend RepairEngine uses consistent handle IDs (needs fix)
