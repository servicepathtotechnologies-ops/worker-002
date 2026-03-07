# DAG Validator Root-Level Fix

## Problem Statement

Despite having the deterministic workflow DAG compiler rules defined in `.cursor/rules/deterministic-workflow-dag-compiler.mdc`, workflows were not being generated correctly. The system was violating core DAG rules:

1. **Burst Flow**: Multiple edges from trigger or normal nodes
2. **Invalid Node Degrees**: Nodes with wrong in-degree/out-degree
3. **Missing MERGE Nodes**: Branches reconverging without MERGE
4. **IF/SWITCH Edge Types**: Not properly labeling true/false or case edges
5. **No Validation**: Workflows output without DAG validation

## Root Cause Analysis

The workflow generation pipeline (`workflow-structure-builder.ts`) was:
- Creating connections heuristically without validating DAG rules
- Not enforcing strict linear flow by default
- Not properly handling IF/SWITCH branching with MERGE nodes
- Missing validation checkpoint before output

## Solution: Root-Level DAG Validator

### 1. Created DAG Validator (`worker/src/core/validation/dag-validator.ts`)

A comprehensive validator that enforces ALL deterministic DAG rules:

**Validation Checks:**
- ✅ No duplicate node IDs
- ✅ No duplicate edges
- ✅ No self-loops
- ✅ Trigger has exactly 1 outgoing edge
- ✅ Normal nodes: in-degree = 1, out-degree = 1
- ✅ IF nodes: in-degree = 1, out-degree = 2 (true/false)
- ✅ SWITCH nodes: in-degree = 1, out-degree >= 2 (case_1, case_2, etc.)
- ✅ MERGE nodes: in-degree >= 2, out-degree = 1
- ✅ LOG nodes: in-degree = 1, out-degree = 0 (terminal)
- ✅ No cycles (acyclic graph)
- ✅ No burst flow (only IF/SWITCH can have multiple outputs)
- ✅ All nodes reachable from trigger
- ✅ LOG nodes from multiple paths must go through MERGE

**Auto-Fix Capabilities:**
- Removes duplicate edges
- Removes self-loops
- Rebuilds as linear chain on critical errors

### 2. Integrated into Workflow Structure Builder

**File**: `worker/src/services/ai/workflow-structure-builder.ts`

**Changes:**
- ✅ Imported DAG validator
- ✅ Added validation checkpoint after structure building (Step 8)
- ✅ Auto-rebuilds as linear chain on critical DAG errors
- ✅ Fixed `buildFromScratch()` to enforce strict linear flow
- ✅ Fixed `addConditionalLogic()` to properly handle IF/SWITCH with MERGE
- ✅ Added `rebuildAsLinearChain()` fallback method

**Key Fixes:**

#### `buildFromScratch()` - Strict Linear Flow
```typescript
// DAG Rule: Trigger must have exactly 1 outgoing edge
if (orderedNodes.length > 0) {
  connections.push({
    source: 'trigger',
    target: orderedNodes[0].id,
    // ...
  });
}

// DAG Rule: Connect nodes sequentially (linear chain)
for (let i = 0; i < orderedNodes.length - 1; i++) {
  connections.push({
    source: orderedNodes[i].id,
    target: orderedNodes[i + 1].id,
    // Each node: in-degree = 1, out-degree = 1
  });
}
```

#### `addConditionalLogic()` - Proper IF/SWITCH Handling
```typescript
// DAG Rule: IF node must have exactly 2 outputs (true/false)
structure.connections.push({
  source: ifElseNode.id,
  target: firstTrueNode.id,
  sourceOutput: 'true',  // ✅ Proper edge type
  targetInput: 'input',
});

structure.connections.push({
  source: ifElseNode.id,
  target: firstFalseNode.id,
  sourceOutput: 'false',  // ✅ Proper edge type
  targetInput: 'input',
});

// DAG Rule: If branches reconverge → insert MERGE node
if (truePathEnd && falsePathEnd) {
  const mergeNode = { id: `merge_${index}`, type: 'merge' };
  structure.nodes.push(mergeNode);
  // Connect both paths to MERGE
}
```

### 3. Updated Pipeline Orchestrator

**File**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`

**Changes:**
- ✅ Uses edge type from structure connections (true/false for IF, case_1/case_2 for SWITCH)
- ✅ Properly propagates DAG edge types to WorkflowEdge objects

### 4. Updated Type Definitions

**Files**: 
- `worker/src/services/ai/workflow-structure-builder.ts`
- `worker/src/core/validation/dag-validator.ts`

**Changes:**
- ✅ Added `type?: string` to connection interface for edge types (true/false/case_1/etc.)

## Validation Flow

```
User Prompt
  ↓
Structured Intent
  ↓
Workflow Structure (buildFromScratch / addConditionalLogic)
  ↓
DAG Validation ← ✅ NEW CHECKPOINT
  ↓
  ├─ Valid → Continue
  └─ Invalid → Rebuild as Linear Chain → Re-validate
  ↓
Final Workflow (DAG-compliant)
```

## DAG Rules Enforced

### Section 2: Default Flow Policy
- ✅ **STRICTLY LINEAR by default** (no branching unless explicitly requested)
- ✅ No parallel paths
- ✅ No multiple outputs
- ✅ No MERGE/SWITCH/IF unless conditions requested

### Section 3: Node Degree Rules
- ✅ Trigger: in-degree = 0, out-degree = 1
- ✅ Normal nodes: in-degree = 1, out-degree = 1
- ✅ IF nodes: in-degree = 1, out-degree = 2 (true/false)
- ✅ SWITCH nodes: in-degree = 1, out-degree >= 2 (case_1, case_2, etc.)
- ✅ MERGE nodes: in-degree >= 2, out-degree = 1
- ✅ LOG nodes: in-degree = 1, out-degree = 0

### Section 7: Burst Flow Prevention
- ✅ No burst from trigger
- ✅ No burst from normal nodes
- ✅ Only IF/SWITCH can have multiple outputs

### Section 8: MERGE Rule
- ✅ MERGE required when branches reconverge
- ✅ Properly inserted in `addConditionalLogic()`

## Testing

The validator can be tested by:

1. **Linear Workflow** (should pass):
   ```
   trigger → node1 → node2 → log
   ```

2. **IF Workflow** (should pass):
   ```
   trigger → if_else
              ├─ true → nodeA → merge
              └─ false → nodeB → merge
                          merge → log
   ```

3. **Invalid Workflow** (should fail and rebuild):
   ```
   trigger → node1
              ├─ node2  ❌ Burst flow
              └─ node3  ❌ Burst flow
   ```

## Files Modified

1. ✅ `worker/src/core/validation/dag-validator.ts` (NEW)
2. ✅ `worker/src/services/ai/workflow-structure-builder.ts` (MODIFIED)
3. ✅ `worker/src/services/ai/workflow-pipeline-orchestrator.ts` (MODIFIED)

## Result

✅ **Root-level fix**: DAG validation is now enforced at the core workflow generation level
✅ **Automatic compliance**: All workflows must pass DAG validation before output
✅ **Auto-repair**: Critical errors trigger linear chain rebuild
✅ **Proper branching**: IF/SWITCH/MERGE handled correctly
✅ **No burst flow**: Only IF/SWITCH can have multiple outputs

## Next Steps

1. Test with various workflow prompts
2. Monitor validation errors in logs
3. Adjust auto-fix logic if needed
4. Consider adding more sophisticated MERGE detection
