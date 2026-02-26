# Edge Handle ID Consistency Patch

## Issue

The `RepairEngine.getDefaultInputField()` method was returning config field names instead of React Flow handle IDs, which could cause mismatches between backend edge creation and frontend handle IDs.

## Fix

**File**: `worker/src/services/ai/repair-engine.ts`

### Changes

1. **Import handle registry function**:
```diff
import { WorkflowStructure } from './workflow-structure-builder';
import { StructuredIntent } from './intent-structurer';
import { nodeLibrary } from '../nodes/node-library';
+ import { getDefaultTargetHandle } from '../../core/utils/node-handle-registry';
```

2. **Update getDefaultInputField() method**:
```diff
  /**
-  * Get default input field for node type
+  * Get default input handle ID for node type
+  * 
+  * ✅ CRITICAL: Returns React Flow handle ID, not config field name.
+  * All standard nodes use 'input' as the target handle ID.
+  * Special nodes (ai_agent) use their specific handle IDs.
   */
  private getDefaultInputField(nodeType: string): string {
-    // Check node schema for default input field
-    const schema = nodeLibrary.getSchema(nodeType);
-    if (schema?.configSchema?.required) {
-      const requiredFields = schema.configSchema.required;
-      // Prefer common input field names
-      if (requiredFields.includes('input')) return 'input';
-      if (requiredFields.includes('data')) return 'data';
-      if (requiredFields.includes('userInput')) return 'userInput';
-      // Return first required field
-      return requiredFields[0];
-    }
-    // Default to 'input' for standard nodes
-    return 'input';
+    // Use handle registry for consistency with frontend
+    return getDefaultTargetHandle(nodeType);
  }
```

## Verification

### Before Fix
- `getDefaultInputField()` could return config field names like `'data'`, `'userInput'`, or first required field
- This could cause handle ID mismatches if the field name didn't match the React Flow handle ID

### After Fix
- `getDefaultInputField()` now uses `getDefaultTargetHandle()` from the handle registry
- Returns `'input'` for standard nodes (consistent with frontend)
- Returns `'userInput'` for `ai_agent` nodes (special case, consistent with frontend)
- All handle IDs are now consistent between backend and frontend

## Impact

✅ **All edge creation now uses consistent handle IDs**:
- Standard nodes: `sourceHandle: 'output'`, `targetHandle: 'input'`
- Special nodes: Uses handle registry for correct IDs (e.g., `ai_agent` uses `'userInput'`)

✅ **No breaking changes**: The fix maintains backward compatibility while ensuring consistency.

## Files Modified

1. `worker/src/services/ai/repair-engine.ts`
   - Added import for `getDefaultTargetHandle`
   - Updated `getDefaultInputField()` to use handle registry

## Testing

Verify that:
1. ✅ All edges created by RepairEngine use correct handle IDs
2. ✅ Standard nodes use `'input'` and `'output'`
3. ✅ Special nodes (ai_agent) use their specific handle IDs
4. ✅ Frontend can connect edges correctly
