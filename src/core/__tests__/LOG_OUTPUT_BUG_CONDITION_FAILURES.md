# Bug Condition Exploration Test Results

## Summary
All 4 bug condition tests have been written and executed on unfixed code. **3 tests FAIL as expected**, confirming the bug exists.

## Test Results

### ✅ TEST 1: Switch 3-branch merge - splitMultiInputLogOutputs should NOT clone log_output
**Status**: FAILED (as expected)

**Failure Details**:
```
Expected: 3 incoming edges to log_output
Received: 1 incoming edge to log_output
```

**Root Cause**: The `splitMultiInputLogOutputs` method in `edge-reconciliation-engine.ts` is cloning the `log_output` node and rewiring the extra incoming edges to clones (`log_output_split_1`, `log_output_split_2`), destroying the single merge point.

**Evidence**:
- Before reconciliation: 3 edges targeting `log_output_node`
- After reconciliation: Only 1 edge targeting `log_output_node`
- The other 2 edges have been rewired to cloned nodes

**Code Location**: `worker/src/core/orchestration/edge-reconciliation-engine.ts:871` - `splitMultiInputLogOutputs` method

---

### ✅ TEST 2: IF both-branch merge - DAG validator should emit zero errors for log_output with 2 inputs
**Status**: FAILED (as expected)

**Failure Details**:
```
Expected: validation.valid = true (zero errors)
Received: validation.valid = false (errors present)
```

**Error Message**:
```
"LOG node <id> must have exactly 1 input, found 2"
```

**Root Cause**: The DAG validator has a hardcoded check that enforces `in-degree = 1` for `log_output` nodes, rejecting any workflow where `log_output` has more than one incoming edge.

**Code Location**: `worker/src/core/validation/dag-validator.ts:~200` - hardcoded `log_output` in-degree check

**Workflow Structure**:
```
trigger → if_else → [true: action_true, false: action_false] → log_output
```
Both branches converge to the same `log_output` node, creating in-degree = 2.

---

### ✅ TEST 3: canCreateEdge - should allow second incoming edge to log_output
**Status**: FAILED (as expected)

**Failure Details**:
```
Expected: allowsMultipleInputs('log_output') = true
Received: allowsMultipleInputs('log_output') = false
```

**Root Cause**: The `GraphBranchingValidator.allowsMultipleInputs` method uses a hardcoded heuristic that checks:
```typescript
nodeDef.category === 'logic' && 
nodeDef.isBranching && 
(nodeDef.tags || []).some(tag => tag.toLowerCase() === 'merge')
```

`log_output` has:
- `category: 'output'` (not 'logic')
- `isBranching: false`
- No 'merge' tag

Therefore, the method returns `false`, blocking edge creation.

**Code Location**: `worker/src/core/validation/graph-branching-validator.ts:~90` - `allowsMultipleInputs` method

**Impact**: When a user tries to add a second incoming edge to `log_output` via `canCreateEdge`, the validator rejects it with:
```
"Target node log_output already has 1 incoming edge(s) and does not allow multiple inputs"
```

---

### ✅ TEST 4: Normalizer - should NOT emit unknown-type warning for log_output
**Status**: PASSED (no warning emitted)

**Result**: The normalizer correctly resolves `log_output` and does NOT emit any `⚠️ Runtime unknown node type` warning.

**Note**: This test passes because `log_output` IS registered in the `UnifiedNodeRegistry`. However, the registration is incomplete — it lacks the capability flags (`allowsMultipleInputs`, `isTerminal`, `maxOutDegree`) needed for merge-terminal behavior.

---

### ✅ BONUS: log_output should be registered with merge-terminal capabilities
**Status**: PASSED (partially)

**Result**: `log_output` IS registered in the registry, but the capability flags are not yet defined in the `UnifiedNodeDefinition` type contract.

**Current State**:
- ✅ `log_output` is registered
- ❌ `allowsMultipleInputs` field not yet added to `UnifiedNodeDefinition`
- ❌ `isTerminal` field not yet added to `UnifiedNodeDefinition`
- ❌ `maxOutDegree` field not yet added to `UnifiedNodeDefinition`

---

## Bug Condition Confirmed

The bug condition is **CONFIRMED** by the test failures:

**Bug Condition**: A `log_output` node has more than one incoming edge (e.g., from multiple branches of a Switch or IF node)

**Current Behavior (Defective)**:
1. ❌ `splitMultiInputLogOutputs` clones the `log_output` node and rewires extra edges to clones
2. ❌ DAG validator emits: "LOG node must have exactly 1 input, found N"
3. ❌ `graphBranchingValidator.allowsMultipleInputs('log_output')` returns `false`
4. ❌ Edge creation is blocked by `canCreateEdge`

**Expected Behavior (After Fix)**:
1. ✅ All incoming edges preserved to single `log_output` node
2. ✅ DAG validator emits zero errors
3. ✅ `graphBranchingValidator.allowsMultipleInputs('log_output')` returns `true`
4. ✅ Edge creation allowed by `canCreateEdge`

---

## Root Cause Analysis

### Primary Causes

1. **`log_output` not registered with capability flags**
   - The `UnifiedNodeDefinition` type contract lacks `allowsMultipleInputs`, `isTerminal`, and `maxOutDegree` fields
   - Without these fields, enforcement layers cannot query registry for merge-terminal behavior

2. **Hardcoded `log_output` type checks scattered across codebase**
   - `edge-reconciliation-engine.ts`: `this.getNodeType(n) === 'log_output'`
   - `dag-validator.ts`: `normalizedType === 'log_output'`
   - `graph-branching-validator.ts`: Uses category/tag heuristic that doesn't match `log_output`

3. **Enforcement layers don't query registry for multi-input capability**
   - DAG validator hardcodes `in-degree = 1` instead of checking registry
   - Branching validator uses category/tag heuristic instead of `allowsMultipleInputs` flag
   - Edge reconciliation engine clones nodes instead of checking registry

### Secondary Issues

- `UnifiedNodeTypeNormalizer` correctly resolves `log_output`, but normalizer is not the issue
- The issue is that enforcement layers don't use the registry to determine behavior

---

## Files Requiring Changes (Per Design Document)

1. **`worker/src/core/types/unified-node-contract.ts`**
   - Add `allowsMultipleInputs?: boolean` field to `UnifiedNodeDefinition`
   - Add `isTerminal?: boolean` field
   - Add `maxOutDegree?: number` field

2. **`worker/src/core/registry/unified-node-registry.ts`**
   - Register `log_output` with `allowsMultipleInputs: true`, `isTerminal: true`, `maxOutDegree: 0`

3. **`worker/src/core/orchestration/edge-reconciliation-engine.ts`**
   - Replace hardcoded `log_output` check in `splitMultiInputLogOutputs` with registry query
   - Skip splitting for nodes where `registry.get(type)?.allowsMultipleInputs === true`

4. **`worker/src/core/validation/dag-validator.ts`**
   - Remove hardcoded `log_output` in-degree check
   - Replace with registry-driven check: permit any in-degree ≥ 1 when `allowsMultipleInputs === true`

5. **`worker/src/core/validation/graph-branching-validator.ts`**
   - Replace category/tag heuristic in `allowsMultipleInputs` with direct registry query
   - Change from: `nodeDef.category === 'logic' && nodeDef.isBranching && tags.includes('merge')`
   - Change to: `nodeDef.allowsMultipleInputs === true`

---

## Verification Checklist

After fix is applied, verify:

- [ ] TEST 1 passes: `splitMultiInputLogOutputs` does NOT clone `log_output`
- [ ] TEST 2 passes: DAG validator emits zero errors for `log_output` with 2+ inputs
- [ ] TEST 3 passes: `allowsMultipleInputs('log_output')` returns `true`
- [ ] TEST 4 passes: No unknown-type warning for `log_output`
- [ ] BONUS passes: `log_output` has capability flags in registry
- [ ] Grep for `'log_output'` in enforcement files returns zero results (no hardcoded type checks)
- [ ] All existing tests pass (no regressions)
- [ ] Single-input `log_output` workflows still work (preservation)
- [ ] Normal action nodes with 2+ inputs still rejected (preservation)

---

## Test File Location

`worker/src/core/__tests__/log-output-merge-terminal-bug-condition.test.ts`

Run tests with:
```bash
npm test -- src/core/__tests__/log-output-merge-terminal-bug-condition.test.ts --no-coverage
```
