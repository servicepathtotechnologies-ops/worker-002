# Workflow Validator Node Resolution Fix

## Problem

The workflow validator was checking node types directly in the registry without using alias mapping. This caused:
- Nodes with aliases (e.g., `"gmail"`) to fail validation
- Missing canonical type resolution
- Inconsistent node type handling

## Solution

Updated the workflow validator to:
1. **Resolve node types** using `resolveNodeType()` before validation
2. **Replace node type** with canonical type in-place
3. **Only remove node** if resolution completely fails (with fallback)
4. **Log resolution** for debugging

## Implementation

### 1. Backend Validator (`workflow-validation-pipeline.ts`) ✅

**File**: `worker/src/services/ai/workflow-validation-pipeline.ts`

**Changes**:
- ✅ Uses `resolveNodeType()` utility before validation
- ✅ Replaces node type with canonical type in-place
- ✅ Only removes node if resolution and fallback both fail
- ✅ Logs all resolution attempts

**Resolution Flow**:
```typescript
// Step 1: Resolve node type using resolveNodeType() utility
const canonicalType = resolveNodeType(originalNodeType, true);

// Step 2: Check if resolved type exists in registry
const schema = nodeLibrary.getSchema(canonicalType);

if (schema) {
  // Resolution successful - update node with canonical type
  if (canonicalType !== originalNodeType) {
    node.data.type = canonicalType; // Replace with canonical
    console.log(`Resolved "${originalNodeType}" → "${canonicalType}"`);
  }
} else {
  // Step 3: Resolution failed - try generic fallback
  const fallbackType = getGenericFallbackType(originalNodeType);
  // ... update node with fallback or keep with warning
}
```

**Before**:
```typescript
// ❌ Direct registry check without resolution
const schema = nodeLibrary.getSchema(actualNodeType);
if (!schema) {
  // Node fails validation
}
```

**After**:
```typescript
// ✅ Resolve first, then check registry
const canonicalType = resolveNodeType(originalNodeType, true);
const schema = nodeLibrary.getSchema(canonicalType);
if (schema) {
  node.data.type = canonicalType; // Replace with canonical
}
```

### 2. Key Improvements ✅

#### A. Resolution Before Validation
- Node types are resolved **before** registry lookup
- Aliases automatically converted to canonical types
- Example: `"gmail"` → `"google_gmail"` before validation

#### B. In-Place Type Replacement
- Node type is updated in-place with canonical type
- `node.data.type` is replaced with resolved type
- Ensures consistency throughout workflow

#### C. Fallback Strategy
1. **Step 1**: Resolve using `resolveNodeType()`
2. **Step 2**: If resolution fails, try generic fallback
3. **Step 3**: If fallback fails, keep node with warning (never remove)

#### D. Comprehensive Logging
- Logs resolution: `"Resolved 'gmail' → 'google_gmail'"`
- Logs fallback: `"Using fallback 'ai_service'"`
- Logs failures: `"Resolution failed, keeping node with warning"`

## Example Scenarios

### Scenario 1: Alias Resolution
**Input**: Node with type `"gmail"`
**Process**:
1. `resolveNodeType("gmail", true)` → `"google_gmail"`
2. `nodeLibrary.getSchema("google_gmail")` → ✅ Found
3. `node.data.type = "google_gmail"` (replaced)
4. Log: `"Resolved 'gmail' → 'google_gmail'"`

### Scenario 2: Already Canonical
**Input**: Node with type `"google_gmail"`
**Process**:
1. `resolveNodeType("google_gmail", true)` → `"google_gmail"` (no change)
2. `nodeLibrary.getSchema("google_gmail")` → ✅ Found
3. No replacement needed (already canonical)
4. Log: `"Node type 'google_gmail' is already canonical"` (debug only)

### Scenario 3: Resolution Failed, Fallback Success
**Input**: Node with type `"custom_llm"`
**Process**:
1. `resolveNodeType("custom_llm", true)` → `"custom_llm"` (not found)
2. `nodeLibrary.getSchema("custom_llm")` → ❌ Not found
3. `getGenericFallbackType("custom_llm")` → `"ai_service"`
4. `nodeLibrary.getSchema("ai_service")` → ✅ Found
5. `node.data.type = "ai_service"` (replaced with fallback)
6. Log: `"Resolution failed, using fallback 'ai_service'"`

### Scenario 4: Complete Failure
**Input**: Node with type `"xyz_unknown"`
**Process**:
1. `resolveNodeType("xyz_unknown", true)` → `"xyz_unknown"` (not found)
2. `nodeLibrary.getSchema("xyz_unknown")` → ❌ Not found
3. `getGenericFallbackType("xyz_unknown")` → `"http_request"`
4. `nodeLibrary.getSchema("http_request")` → ✅ Found
5. `node.data.type = "http_request"` (replaced with generic fallback)
6. Log: `"Using generic fallback 'http_request'"`

## Benefits

1. **Automatic Resolution**: Aliases resolved before validation
2. **Type Consistency**: Nodes always have canonical types
3. **No Data Loss**: Nodes kept even if resolution fails (with fallback)
4. **Better Logging**: Clear visibility into resolution process
5. **Centralized Logic**: Uses `resolveNodeType()` utility

## Files Modified

1. **`worker/src/services/ai/workflow-validation-pipeline.ts`**:
   - Replaced `nodeTypeResolver.resolve()` with `resolveNodeType()` utility
   - Simplified resolution logic
   - Enhanced logging
   - Improved type replacement

## Verification

✅ **Type Check**: Passes
✅ **Resolution**: Works for all aliases
✅ **Type Replacement**: Nodes updated in-place
✅ **Logging**: All resolutions logged
✅ **Fallback**: Generic fallback works

## Usage

The validator now automatically:
1. Resolves node types before validation
2. Replaces node types with canonical types
3. Falls back to generic types if resolution fails
4. Logs all resolution attempts

**No manual intervention needed** - it handles all node type resolution automatically.
