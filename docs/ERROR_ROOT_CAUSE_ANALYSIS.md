# Error Root Cause Analysis

## The Error

```
❌ Workflow validation failed: [
  "Edge 95c4ffc5-d9c7-4557-b63f-2d13ec85ddc5 (manual_trigger → hubspot): 
   Output field 'output' does not exist in manual_trigger node. 
   Available fields: inputData"
]
```

---

## Root Cause Chain

### Step 1: Node Creation with `type: 'custom'`

**What Happens:**
```typescript
// In workflow-builder.ts, nodes are created like this:
node.type = 'custom';  // Frontend expects this
node.data.type = 'hubspot';  // Actual node type stored here
```

**Why:** The frontend React Flow library expects `type: 'custom'` for most nodes, with the actual type stored in `data.type`. This is a frontend compatibility requirement.

**Result:** Nodes have `type: 'custom'` but `data.type: 'manual_trigger'` or `data.type: 'hubspot'`.

---

### Step 2: Edge Creation Tries to Use `'output'` Handle

**What Happens:**
When creating an edge from `manual_trigger` to `hubspot`, the system needs to determine:
- **Source Handle:** What output field from `manual_trigger`?
- **Target Handle:** What input field on `hubspot`?

**The Problem Code:**
```typescript
// In getPreviousNodeOutputFields() - BEFORE FIX
private getPreviousNodeOutputFields(previousNode: WorkflowNode): string[] {
  // ...
  if (outputFields.length === 0) {
    // ❌ BUG: Uses previousNode.type directly
    // If node.type = 'custom', this passes 'custom' to inferOutputFieldsFromNodeType()
    outputFields.push(...this.inferOutputFieldsFromNodeType(previousNode.type));
  }
  
  // ❌ FALLBACK: If no fields found, returns generic ['output']
  if (outputFields.length === 0) {
    outputFields.push('data', 'output', 'result');
  }
}
```

**What Actually Happened:**
1. `previousNode.type = 'custom'` (not `'manual_trigger'`)
2. `inferOutputFieldsFromNodeType('custom')` → returns `[]` (no match)
3. Falls back to `['data', 'output', 'result']`
4. System picks `'output'` as the source handle
5. Creates edge with `sourceHandle: 'output'`

---

### Step 3: Alternative Mapping Also Uses `'output'`

**What Happens:**
When the primary mapping fails validation, the system tries an alternative mapping:

```typescript
// In findAlternativeMapping() - BEFORE FIX
const commonMappings = [
  { source: 'data', target: 'data' },
  { source: 'output', target: 'input' },  // ❌ This matches!
  { source: 'result', target: 'value' },
  // ...
];

// Since sourceOutputs = ['output'] (from fallback above)
// This finds: sourceField = 'output', targetField = 'input'
// Returns: { outputField: 'output', inputField: 'input' }
```

**Result:** Alternative mapping also returns `'output'` as the output field.

---

### Step 4: Validation Correctly Rejects It

**What Happens:**
The validator checks if `'output'` exists in `manual_trigger`:

```typescript
// In comprehensive-workflow-validator.ts
const sourceOutputs = this.getNodeOutputFields('manual_trigger');
// Returns: ['inputData', 'timestamp', 'triggerType']

if (!sourceOutputs.includes('output')) {
  // ❌ ERROR: 'output' does not exist!
  errors.push(`Output field 'output' does not exist in manual_trigger node`);
}
```

**Why It's Correct:** The validator is RIGHT - `manual_trigger` does NOT have an `'output'` field. It has `'inputData'`.

---

## The Complete Flow

```
1. Node Created
   └─> type: 'custom', data.type: 'manual_trigger'

2. Edge Creation Starts
   └─> Need source handle from manual_trigger

3. getPreviousNodeOutputFields() Called
   └─> Sees node.type = 'custom' (not normalized!)
   └─> inferOutputFieldsFromNodeType('custom') → []
   └─> Falls back to ['output']
   └─> Returns ['output'] ❌

4. Edge Created with sourceHandle: 'output'
   └─> Edge: { sourceHandle: 'output', targetHandle: 'input' }

5. Validation Runs
   └─> Checks: Does 'manual_trigger' have 'output' field?
   └─> Answer: NO (it has 'inputData')
   └─> ERROR: "Output field 'output' does not exist" ✅ (Correct error!)

6. Alternative Mapping Tried
   └─> Also returns 'output' (same bug)
   └─> Still fails validation
```

---

## Why This Was Hard to Catch

1. **Frontend Compatibility:** The `type: 'custom'` pattern is intentional for frontend compatibility, so it's not obvious it causes issues.

2. **Fallback Logic:** The fallback to `['output']` seems reasonable for generic nodes, but breaks for triggers.

3. **Multiple Code Paths:** The bug appears in multiple places:
   - `getPreviousNodeOutputFields()` - doesn't normalize
   - `findAlternativeMapping()` - uses generic mappings
   - Edge creation - doesn't always validate handles

4. **Validation Works Correctly:** The validator correctly rejects the invalid edge, but the edge shouldn't have been created with wrong handles in the first place.

---

## The Fixes Applied

### Fix 1: Normalize Node Type in `getPreviousNodeOutputFields()`

```typescript
// AFTER FIX
if (outputFields.length === 0) {
  // ✅ Uses normalizeNodeType to get actual type
  const nodeActualType = normalizeNodeType(previousNode);
  outputFields.push(...this.inferOutputFieldsFromNodeType(nodeActualType));
}
// Now returns ['inputData', 'timestamp', 'triggerType'] for manual_trigger ✅
```

### Fix 2: Prioritize Trigger Fields in `findAlternativeMapping()`

```typescript
// AFTER FIX
// ✅ Special handling for triggers FIRST
if (sourceActualType === 'manual_trigger' || sourceActualType === 'workflow_trigger') {
  const inputDataField = sourceOutputs.find(f => f.toLowerCase() === 'inputdata');
  if (inputDataField) {
    return { outputField: inputDataField, inputField: targetField };
  }
}

// ✅ Prioritize actual fields over generic 'output'
const commonMappings = [
  { source: 'inputdata', target: 'input' }, // Triggers first!
  { source: 'message', target: 'message' },
  // ... 'output' is last resort
];
```

### Fix 3: Validate All Edge Handles

```typescript
// AFTER FIX
// ✅ Always validate and fix handles before creating edge
const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
  sourceActualType,
  targetActualType,
  alternativeMapping.outputField,
  alternativeMapping.inputField
);
```

---

## Summary

**Root Cause:** 
- Nodes use `type: 'custom'` for frontend compatibility
- Code wasn't normalizing node types before getting output fields
- System fell back to generic `'output'` field
- `manual_trigger` doesn't have `'output'` - it has `'inputData'`
- Validator correctly rejected the invalid edge

**The Fix:**
- Always use `normalizeNodeType()` before checking node types
- Prioritize actual output fields (like `inputData`) over generic fallbacks
- Validate and fix all edge handles before creating edges

**Lesson Learned:**
- Never trust `node.type` directly - always normalize first
- Generic fallbacks (`'output'`, `'data'`) should be last resort, not first choice
- Different node types have different output fields - triggers are special

---

*This error occurred because the system was treating all nodes generically instead of recognizing that triggers have specific output fields that differ from standard nodes.*
