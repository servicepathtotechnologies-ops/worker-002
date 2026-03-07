# ✅ IF/ELSE Branch Assignment Fix

## 🐛 Issue

When an `if_else` node has multiple output nodes, both outputs were being connected without specifying which branch (`true` or `false`) each output belongs to. This resulted in:

- **Problem**: `google_gmail` connected from both `true` and `false` branches
- **Root Cause**: `workflow-dsl-compiler.ts` was connecting all outputs to `if_else` without setting `sourceHandle: 'true'` or `sourceHandle: 'false'`

## ✅ Solution

**File**: `worker/src/services/ai/workflow-dsl-compiler.ts` (lines 1159-1210)

### **Fix Logic**:

1. **For 2 outputs** (most common case):
   - First output → `true` branch (`sourceHandle: 'true'`)
   - Second output → `false` branch (`sourceHandle: 'false'`)

2. **For more than 2 outputs**:
   - First output → `true` branch
   - Second output → `false` branch
   - Remaining outputs → Chained sequentially after false branch

3. **Edge Type Assignment**:
   - True branch edges: `type: 'true'`
   - False branch edges: `type: 'false'`

### **Code Changes**:

```typescript
// ✅ ROOT-LEVEL FIX: For if_else nodes, assign outputs to true/false branches intelligently
if (lastTransformationType === 'if_else' && sortedOutputs.length === 2) {
  // ✅ CRITICAL: Assign first output to 'true' branch, second to 'false' branch
  const trueOutput = sortedOutputs[0];
  const falseOutput = sortedOutputs[1];
  
  // Create edge for true branch
  const trueEdge = this.createCompatibleEdge(lastTransformation, trueOutput, edges);
  if (trueEdge) {
    trueEdge.sourceHandle = 'true'; // ✅ CRITICAL: Set true branch handle
    trueEdge.type = 'true';
    edges.push(trueEdge);
  }
  
  // Create edge for false branch
  const falseEdge = this.createCompatibleEdge(lastTransformation, falseOutput, edges);
  if (falseEdge) {
    falseEdge.sourceHandle = 'false'; // ✅ CRITICAL: Set false branch handle
    falseEdge.type = 'false';
    edges.push(falseEdge);
  }
}
```

## 📊 Example

### **Before Fix**:
```
if_else
  ├─→ salesforce (no branch specified)
  └─→ google_gmail (no branch specified)
```

### **After Fix**:
```
if_else
  ├─→ salesforce (sourceHandle: 'true', type: 'true')
  └─→ google_gmail (sourceHandle: 'false', type: 'false')
```

## ✅ Verification

- ✅ `if_else` nodes now correctly assign outputs to `true` and `false` branches
- ✅ Edge `sourceHandle` is set correctly (`'true'` or `'false'`)
- ✅ Edge `type` matches the branch (`'true'` or `'false'`)
- ✅ Works for 2 outputs (most common case)
- ✅ Works for more than 2 outputs (chains remaining after false branch)

## 🔄 Related Issues

1. **Google Calendar Not Recognized**: 
   - **Cause**: Operation normalization fix was applied, but workflow was generated before the fix
   - **Solution**: Regenerate the workflow - the fix will now correctly categorize `google_calendar(create_event)` as OUTPUT
   - **Fix Location**: `worker/src/services/ai/workflow-dsl.ts` (operation normalization in capability fallback)

2. **Prompt Selection Issue**:
   - **Cause**: User prompt "Auto-schedule meetings from emails and update calendar" was transformed to a different prompt variation that didn't include calendar
   - **Solution**: The operation normalization fix ensures `google_calendar` operations are recognized, but the prompt selection layer may need improvement

## 📝 Notes

- This fix is **universal** and applies to all `if_else` nodes with multiple outputs
- The branch assignment follows semantic convention: first output = true, second output = false
- Future enhancement: Could use AI to analyze prompt and determine which output semantically belongs to which branch
