# Workflow Planner Registry Integration

## Problem

The workflow planner was using hardcoded abstract action names (like `'fetch_google_sheets_data'`, `'summarize_data'`) that then needed to be mapped to actual node types. This created:
- Disconnect between planner and registry
- Risk of planner inventing node names
- Extra mapping layer complexity
- Validation issues

## Solution

Refactored the workflow planner to use **canonical node types directly from the node registry**.

## Changes Made

### 1. Registry-Driven Node Types ✅

**File**: `worker/src/services/workflow-planner.ts`

**Changes**:
- ✅ Removed hardcoded `ALLOWED_ACTIONS` array
- ✅ Added `getAllowedNodeTypes()` function that fetches from registry
- ✅ Dynamically generates `ALLOWED_NODE_TYPES` from registry
- ✅ Filters out internal/system nodes (function_item, memory, tool, chat_model)

**Before**:
```typescript
export const ALLOWED_ACTIONS = [
  'fetch_google_sheets_data',
  'summarize_data',
  'send_email',
  // ... hardcoded list
];
```

**After**:
```typescript
function getAllowedNodeTypes(): string[] {
  const allNodeTypes = nodeLibrary.getRegisteredNodeTypes();
  const excludedTypes = ['function_item', 'memory', 'tool', 'chat_model'];
  return allNodeTypes.filter(type => !excludedTypes.includes(type));
}

export const ALLOWED_NODE_TYPES = getAllowedNodeTypes();
```

### 2. Updated WorkflowStep Interface ✅

**File**: `worker/src/services/workflow-planner.ts`

**Changes**:
- ✅ Changed from `action: AllowedAction` to `node_type: string`
- ✅ Maintained backward compatibility with optional `action` field
- ✅ Planner now outputs canonical node types directly

**Before**:
```typescript
interface WorkflowStep {
  action: AllowedAction; // e.g., 'fetch_google_sheets_data'
  description?: string;
}
```

**After**:
```typescript
interface WorkflowStep {
  node_type?: string; // Canonical node type from registry (e.g., 'google_sheets')
  action?: string; // Legacy format - deprecated
  description?: string;
}
```

### 3. Enhanced LLM Prompt with Registry Constraints ✅

**File**: `worker/src/services/workflow-planner.ts`

**Changes**:
- ✅ Prompt now lists actual node types from registry
- ✅ Groups nodes by category for better readability
- ✅ Strong constraint: "DO NOT invent node names"
- ✅ Shows trigger nodes separately from action nodes

**Example Prompt**:
```
Available Trigger Node Types:
  1. manual_trigger
  2. schedule
  3. webhook
  4. form

Available Action Node Types (100+ total):
AI (12 nodes):
  - ai_service
  - ai_agent
  - ai_chat_model
  ...

GOOGLE (9 nodes):
  - google_sheets
  - google_gmail
  - google_drive
  ...

🚨 CRITICAL CONSTRAINT: You MUST use ONLY the node types listed above.
DO NOT create new node names or use variations.
```

### 4. Registry-Based Validation ✅

**File**: `worker/src/services/workflow-planner.ts`

**Changes**:
- ✅ `validatePlan()` now validates against actual registry
- ✅ Checks if each `node_type` exists in `nodeLibrary`
- ✅ Provides helpful error messages with available node types
- ✅ Validates trigger types against registry trigger nodes

**Validation Logic**:
```typescript
// Validate each step
const nodeSchema = nodeLibrary.getSchema(step.node_type);
if (!nodeSchema) {
  errors.push(`Step ${index + 1} has invalid node_type: "${step.node_type}". Node type not found in registry.`);
  errors.push(`  Available node types: ${availableNodeTypes.slice(0, 10).join(', ')}...`);
}
```

### 5. Updated Fallback Plan ✅

**File**: `worker/src/services/workflow-planner.ts`

**Changes**:
- ✅ Fallback now uses actual node types from registry
- ✅ Searches registry for matching node types based on keywords
- ✅ No longer uses abstract action names

**Example**:
```typescript
if (promptLower.includes('gmail') || promptLower.includes('email')) {
  const nodeType = availableNodeTypes.find(t => t === 'google_gmail' || t === 'email');
  if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
}
```

### 6. Updated Step-to-Node Mapper ✅

**Files**: 
- `worker/src/services/step-node-mapper.ts`
- `worker/src/services/ai/step-to-node-mapper.ts`
- `worker/src/core/workflow-ir.ts`

**Changes**:
- ✅ Supports both new format (`node_type`) and legacy format (`action`)
- ✅ Directly uses `node_type` when available (no mapping needed)
- ✅ Falls back to action mapping for backward compatibility
- ✅ Validates node types against registry

**Logic**:
```typescript
if (step.node_type) {
  // New format: use directly
  nodeType = step.node_type;
} else if (step.action) {
  // Legacy format: map action to node type
  nodeType = this.mapActionToNodeType(step.action, ...);
}
```

## Benefits

1. **Registry-Driven**: Planner uses actual node types from registry
2. **No Invented Names**: LLM cannot create non-existent node types
3. **Direct Mapping**: No intermediate action-to-node mapping needed
4. **Better Validation**: Validates against actual registry
5. **Backward Compatible**: Still supports legacy `action` format
6. **Automatic Updates**: New nodes automatically available to planner

## Example Output

**Before** (abstract actions):
```json
{
  "trigger_type": "manual",
  "steps": [
    { "action": "fetch_google_sheets_data" },
    { "action": "summarize_data" },
    { "action": "send_email" }
  ]
}
```

**After** (canonical node types):
```json
{
  "trigger_type": "manual_trigger",
  "steps": [
    { "node_type": "google_sheets", "description": "Fetch data from Google Sheets" },
    { "node_type": "ai_service", "description": "Summarize the data" },
    { "node_type": "google_gmail", "description": "Send email with summary" }
  ]
}
```

## Files Modified

1. **`worker/src/services/workflow-planner.ts`**:
   - Removed `ALLOWED_ACTIONS`
   - Added `getAllowedNodeTypes()` and `ALLOWED_NODE_TYPES`
   - Updated `WorkflowStep` interface
   - Enhanced `buildPlanningPrompt()` with registry node types
   - Updated `validatePlan()` to validate against registry
   - Updated `fallbackPlan()` to use registry node types

2. **`worker/src/services/step-node-mapper.ts`**:
   - Updated to handle `node_type` format
   - Maintains backward compatibility with `action` format
   - Added `getDefaultLabelFromNodeType()` method

3. **`worker/src/services/ai/step-to-node-mapper.ts`**:
   - Updated to handle `node_type` format
   - Direct node type usage (no mapping needed)

4. **`worker/src/core/workflow-ir.ts`**:
   - Updated to handle both `node_type` and `action` formats
   - Enhanced trigger detection logic

5. **`worker/src/services/ai/workflow-builder.ts`**:
   - Updated logging to show `node_type` instead of `action`

## Verification

✅ **Type Check**: Passes
✅ **Backward Compatible**: Supports both formats
✅ **Registry Integration**: Fetches node types dynamically
✅ **Validation**: Validates against actual registry
✅ **No Invented Names**: LLM constrained to registry types

## Usage

The planner now automatically:
1. Fetches available node types from registry at startup
2. Includes them in the LLM prompt
3. Validates generated plans against registry
4. Outputs canonical node types directly

**No configuration needed** - it automatically uses whatever nodes are registered in the node library.
