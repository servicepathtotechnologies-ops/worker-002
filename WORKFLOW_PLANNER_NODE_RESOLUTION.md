# Workflow Planner Node Type Resolution Fix

## Problem

The workflow planner was generating node types that might not match the registry:
- LLM could generate aliases (e.g., `"gmail"` instead of `"google_gmail"`)
- No post-generation resolution
- Unknown node names could slip through validation

## Solution

Enhanced the workflow planner to:
1. **Fetch available node types** from registry (already done)
2. **Provide allowed node types** to LLM prompt (enhanced)
3. **Replace generated node types** using resolver (NEW)
4. **Prevent generation** of unknown node names (enhanced validation)

## Implementation

### 1. Node Type Resolution After Generation ✅

**File**: `worker/src/services/workflow-planner.ts`

**New Method**: `resolvePlanNodeTypes()`

**Purpose**: Resolve all node types in the plan after LLM generation, replacing aliases with canonical types.

**Process**:
```typescript
// After parsing LLM response
let plan = this.parsePlanningResponse(rawResponse, attempt);

// Step 1: Resolve all node types using resolver
plan = this.resolvePlanNodeTypes(plan);

// Step 2: Validate plan structure (after resolution)
const validation = this.validatePlan(plan);
```

**Resolution Logic**:
```typescript
private resolvePlanNodeTypes(plan: WorkflowPlan): WorkflowPlan {
  return {
    ...plan,
    steps: plan.steps.map((step, index) => {
      if (step.node_type) {
        const originalType = step.node_type;
        const resolvedType = resolveNodeType(originalType, true);
        
        if (resolvedType !== originalType) {
          console.log(`Resolved "${originalType}" → "${resolvedType}"`);
          return { ...step, node_type: resolvedType }; // Replace
        }
      }
      
      // Handle legacy action format
      if (step.action && !step.node_type) {
        const resolvedType = resolveNodeType(step.action, true);
        return {
          ...step,
          node_type: resolvedType, // Convert to node_type
          action: undefined, // Remove deprecated field
        };
      }
      
      return step;
    }),
  };
}
```

### 2. Enhanced System Prompt ✅

**File**: `worker/src/services/workflow-planner.ts`

**Changes**:
- Includes list of available node types in system prompt
- Strong constraints against inventing node names
- Clear instructions to use only provided node types

**Before**:
```typescript
return `You are a workflow planning engine. Break user requests into ordered workflow actions. Use only allowed actions. Return JSON only.`;
```

**After**:
```typescript
const availableNodeTypes = getAllowedNodeTypes();
const nodeTypesList = availableNodeTypes.slice(0, 50).join(', ');

return `You are a workflow planning engine. Break user requests into ordered workflow steps using ONLY the node types from the registry.

🚨 CRITICAL RULES:
1. Use ONLY the node types provided in the prompt
2. DO NOT invent new node names
3. DO NOT use variations or aliases (e.g., don't use "gmail" - use "google_gmail")
4. Use exact node type names as listed in the prompt

Available node types (first 50): ${nodeTypesList}...

Return JSON only with node_type fields matching the exact node types from the list provided in the prompt.`;
```

### 3. Enhanced Validation ✅

**File**: `worker/src/services/workflow-planner.ts`

**Changes**:
- Validates after resolution (not before)
- Re-resolves if validation fails
- Prevents unknown node names from passing validation
- Clear error messages with resolution attempts

**Validation Flow**:
```typescript
// Step 1: Resolve node types first
plan = this.resolvePlanNodeTypes(plan);

// Step 2: Validate after resolution
const validation = this.validatePlan(plan);

// Step 3: If validation fails, try re-resolution
if (!nodeSchema) {
  const reResolved = resolveNodeType(step.node_type, false);
  const reResolvedSchema = nodeLibrary.getSchema(reResolved);
  
  if (!reResolvedSchema) {
    errors.push(`Invalid node_type: "${step.node_type}". Node type not found even after resolution.`);
    errors.push(`⚠️  This node type was generated but does not exist.`);
  } else {
    step.node_type = reResolved; // Update with re-resolved type
  }
}
```

### 4. Registry-Driven Node Types ✅

**Already Implemented**:
- `getAllowedNodeTypes()` fetches from registry
- `ALLOWED_NODE_TYPES` dynamically generated
- Node types provided to LLM prompt
- Grouped by category for better readability

## Example Scenarios

### Scenario 1: LLM Generates Alias
**LLM Output**: `{ "node_type": "gmail" }`
**Process**:
1. `resolvePlanNodeTypes()` called
2. `resolveNodeType("gmail")` → `"google_gmail"`
3. Plan updated: `{ "node_type": "google_gmail" }`
4. Validation passes ✅
5. Log: `"Resolved 'gmail' → 'google_gmail'"`

### Scenario 2: LLM Generates Unknown Node
**LLM Output**: `{ "node_type": "custom_llm" }`
**Process**:
1. `resolvePlanNodeTypes()` called
2. `resolveNodeType("custom_llm")` → `"custom_llm"` (not found)
3. Validation fails
4. Re-resolution attempted: Still not found
5. Error: `"Invalid node_type: 'custom_llm'. Node type not found even after resolution."`
6. Plan rejected, retry with stricter prompt

### Scenario 3: LLM Uses Correct Type
**LLM Output**: `{ "node_type": "google_gmail" }`
**Process**:
1. `resolvePlanNodeTypes()` called
2. `resolveNodeType("google_gmail")` → `"google_gmail"` (no change)
3. Validation passes ✅
4. No resolution needed

## Benefits

1. **Automatic Resolution**: Aliases automatically converted to canonical types
2. **Prevents Unknown Names**: Validation catches unknown node types
3. **Better LLM Guidance**: System prompt includes node types and constraints
4. **Post-Processing Safety**: Resolution happens after generation, catching any mistakes
5. **Clear Logging**: All resolutions logged for debugging

## Files Modified

1. **`worker/src/services/workflow-planner.ts`**:
   - Added `resolvePlanNodeTypes()` method
   - Enhanced `getSystemPrompt()` with node types list
   - Enhanced `validatePlan()` to re-resolve if needed
   - Integrated resolution into planning flow

## Verification

✅ **Type Check**: Passes
✅ **Resolution**: Works for all aliases
✅ **Validation**: Prevents unknown node names
✅ **Logging**: All resolutions logged
✅ **Registry Integration**: Uses dynamic node types

## Usage

The planner now automatically:
1. Fetches available node types from registry
2. Provides them to LLM in prompt
3. Resolves generated node types after LLM response
4. Validates against registry (after resolution)
5. Prevents unknown node names from passing

**No manual intervention needed** - it handles all node type resolution automatically.
