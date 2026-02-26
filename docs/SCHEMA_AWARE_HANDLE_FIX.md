# Schema-Aware Handle Resolution Fix

## Problem

Connection handle validation errors occurred when creating edges because the system was using generic `'output'` → `'input'` mappings that don't exist on actual node schemas:

- `manual_trigger → if_else` used `'output'` but `manual_trigger` only has: `inputData`, `timestamp`, `triggerType`
- `if_else → google_gmail` used `'true'` but `if_else` only has: `data`, `output` (not `'true'`/`'false'`)
- `if_else` expects input fields `'conditions'` and `'combineOperation'`, not generic `'input'`
- `hubspot` expects input fields like `'resource'`, `'operation'`, `'apiKey'`, etc.

## Solution

Implemented schema-aware handle resolution that:

1. **Maps step output fields to actual node output handles** based on node schemas
2. **Maps step input fields to actual node input handles** based on node schemas
3. **Handles special cases** like `if_else` branching (maps `'true'`/`'false'` to `'output'`/`'data'`)
4. **Uses primary input/output fields** per node type as defaults

## Implementation

### New Helper Functions

#### `resolveSourceHandle(sourceNode, stepOutputField?)`
- Gets actual node type using `normalizeNodeType()`
- Retrieves valid output fields from schema registry
- If step specifies output field:
  - Validates it exists in node outputs
  - For `if_else`, maps `'true'`/`'false'` to `'output'`/`'data'`
- Otherwise uses primary output field per node type:
  - `manual_trigger` → `'inputData'`
  - `workflow_trigger` → `'inputData'`
  - `chat_trigger` → `'message'`
  - `if_else` → `'output'`
  - `hubspot` → `'output'`
  - etc.

#### `resolveTargetHandle(targetNode, stepInputField?)`
- Gets actual node type using `normalizeNodeType()`
- Retrieves valid input fields from schema registry
- If step specifies input field:
  - Validates it exists in node inputs
- Otherwise uses primary input field per node type:
  - `if_else` → `'conditions'` (not `'input'`)
  - `hubspot` → `'resource'` (not `'input'`)
  - `google_sheets` → `'spreadsheetId'`
  - `google_gmail` → `'to'`
  - `ai_agent` → `'userInput'`
  - etc.

### Updated Connection Creation

Both structure-based and sequential connection creation now use:

```typescript
// ✅ SCHEMA-AWARE HANDLE RESOLUTION
const resolvedSourceHandle = this.resolveSourceHandle(sourceNode, connection.outputField);
const resolvedTargetHandle = this.resolveTargetHandle(targetNode, connection.inputField);

// Validate handles exist in schemas
const sourceOutputs = this.getNodeOutputFields(sourceActualType);
const targetInputs = this.getNodeInputFields(targetActualType);

if (!sourceOutputs.includes(resolvedSourceHandle) || !targetInputs.includes(resolvedTargetHandle)) {
  // Try alternative mapping or skip
  continue;
}

// Use validateAndFixEdgeHandles for React Flow compatibility
const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
  sourceActualType,
  targetActualType,
  resolvedSourceHandle,
  resolvedTargetHandle
);
```

## Key Fixes

### 1. Manual Trigger → Any Node
**Before:** Used `'output'` (doesn't exist)  
**After:** Uses `'inputData'` (correct)

### 2. If/Else Branching
**Before:** Used `'true'`/`'false'` (don't exist in schema)  
**After:** Maps to `'output'` or `'data'` (exist in schema)

### 3. If/Else Input
**Before:** Used generic `'input'` (doesn't exist)  
**After:** Uses `'conditions'` (correct primary input)

### 4. HubSpot Input
**Before:** Used generic `'input'` (doesn't exist)  
**After:** Uses `'resource'` (correct primary input)

### 5. Google Services
**Before:** Used generic `'input'`  
**After:** Uses node-specific primary inputs:
- `google_sheets` → `'spreadsheetId'`
- `google_gmail` → `'to'`
- `google_calendar` → `'resource'`

## Validation Flow

1. **Schema Resolution:** Get correct handles from node schemas
2. **Handle Validation:** Verify handles exist in node outputs/inputs
3. **React Flow Compatibility:** Use `validateAndFixEdgeHandles()` for handle IDs
4. **Strict Validation:** Use `validateEdgeHandlesStrict()` before creating edge
5. **Global Safety Guard:** Final validation before returning workflow

## Result

- ✅ All edges use correct source/target handles
- ✅ No more "Output field 'output' does not exist" errors
- ✅ No more "Input field 'input' does not exist" errors
- ✅ `if_else` branching works correctly (uses `'output'` not `'true'`/`'false'`)
- ✅ All node types use their primary input/output fields
- ✅ Schema-aware fallbacks for unknown fields

## Files Modified

- `worker/src/services/ai/workflow-builder.ts`:
  - Added `resolveSourceHandle()` method
  - Added `resolveTargetHandle()` method
  - Updated `getNodeInputFields()` with node-specific defaults
  - Updated structure connection processing
  - Updated sequential connection processing
