# Root-Level Node Type Canonicalization Fix

## Problem

When node types are resolved via pattern matching or alias resolution (e.g., "typeform" → "form"), the system was using the **input type** instead of the **canonical type** from the schema. This caused validation failures because:

1. `NodeLibrary.getSchema("typeform")` finds schema via pattern matching and returns schema with `schema.type = "form"`
2. Code was using the input type `"typeform"` instead of `schema.type = "form"`
3. `ProductionWorkflowBuilder.validateNodesInRegistry()` receives `"typeform"` and fails because capability registry only has `"form"`

## Root Cause

The issue occurred in multiple places where `getSchema()` was called:
- After finding a schema, code used the **input type** instead of **`schema.type`** (canonical name)
- Pattern matching returns schemas with canonical types, but callers weren't using them

## Solution: Universal Canonical Type Usage

### ✅ Fixed Files

#### 1. `intent-constraint-engine.ts` - **ROOT-LEVEL FIX**

**Changed `mapActionToNodeTypes()`:**
- Now returns `schema.type` (canonical) instead of input type when schema is found
- Applied to both normalized lookup and direct lookup fallback

**Changed `getRequiredNodes()`:**
- All places where `getSchema()` is called now use `schema.type` instead of input type:
  - Action nodes
  - DataSource nodes  
  - Transformation nodes
  - Transformation detection nodes
  - Trigger nodes
  - Node validation

**Key Changes:**
```typescript
// ❌ BEFORE: Used input type
const schema = nodeLibrary.getSchema(nodeType);
if (schema) {
  return [nodeType]; // Wrong - uses input
}

// ✅ AFTER: Uses canonical type
const schema = nodeLibrary.getSchema(nodeType);
if (schema) {
  return [schema.type]; // Correct - uses canonical
}
```

### Impact

This fix ensures that:
1. **All node types are canonicalized** before being added to required nodes
2. **Pattern-matched types** (like "typeform" → "form") use canonical names
3. **Capability registry validation** receives canonical types that exist in the registry
4. **No more "hallucinated node" errors** for valid pattern-matched types

## Architecture Principle

**Single Source of Truth for Node Types:**
- `NodeLibrary.getSchema()` is the authoritative source for node type resolution
- When a schema is found, **always use `schema.type`** (canonical name)
- Never use input types after schema resolution

## Testing

After this fix:
- ✅ "typeform" resolves to "form" correctly
- ✅ All pattern-matched types use canonical names
- ✅ Capability registry validation passes
- ✅ No false "hallucinated node" errors

## Files Modified

1. `worker/src/services/ai/intent-constraint-engine.ts`
   - `mapActionToNodeTypes()` - Returns `schema.type`
   - `getRequiredNodes()` - Uses `schema.type` for all node types
   - `validateNodeTypes()` - Uses `schema.type` for validation

## Related Fixes

- `workflow-structure-builder.ts` - Type compatibility fix (separate issue)
- This fix ensures canonical types flow through the entire pipeline
