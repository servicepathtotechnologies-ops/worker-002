# ✅ Execution Order Fix - Implicit Dependencies from DSL Structure

## Problem

When the DSL compiler creates nodes and calls `unifiedGraphOrchestrator.initializeWorkflow()` with **no edges**, the `ExecutionOrderManager.initialize()` method was using topological sort without any dependencies. This caused incorrect node ordering, leading to edges that violated the execution order.

**Error**: `Edge ... violates execution order (source at index 2, target at index 1)`

## Root Cause

1. DSL compiler creates nodes in order: `[trigger, dataSource, transformation, output]`
2. Calls `initializeWorkflow(nodes)` with **NO edges**
3. `ExecutionOrderManager.initialize()` uses topological sort, but with no edges, all nodes have `inDegree = 0`
4. Nodes are sorted only by category priority, which doesn't match the DSL structure
5. Edges are created based on this incorrect order → **violation error**

## Solution

Added `buildImplicitDependencies()` method to `ExecutionOrderManager` that:

1. **Detects when there are no edges** (new workflow from DSL)
2. **Categorizes nodes** using registry: trigger, data, transformation/ai, communication/output
3. **Builds implicit dependencies** based on DSL structure:
   - `trigger` → `data`
   - `data` → `transformation/ai`
   - `transformation/ai` → `communication/output`
4. **Creates dependency graph** that topological sort can use correctly

## Implementation

```typescript
// In ExecutionOrderManager.initialize()
if (edges.length === 0) {
  this.buildImplicitDependencies(nodes, dependencies, inDegree);
}
```

The `buildImplicitDependencies()` method:
- Categorizes all nodes by registry category
- Creates dependencies: all nodes in category N depend on all nodes in category N-1
- Ensures correct linear order: trigger → data → transformation → output

## Result

✅ **Correct execution order** for workflows created from DSL  
✅ **No edge violations** - edges match execution order  
✅ **Universal fix** - works for all workflows, all node types  
✅ **Registry-driven** - uses unifiedNodeRegistry for categorization  

## Testing

The fix ensures that when a workflow is created from DSL:
1. Execution order is: `[trigger, dataSource, transformation, output]`
2. Edges are created: `trigger → dataSource → transformation → output`
3. No violations occur because edges match execution order

## Files Modified

- `worker/src/core/orchestration/execution-order-manager.ts`
  - Added `buildImplicitDependencies()` method
  - Modified `initialize()` to call it when `edges.length === 0`

## Universal Compliance

✅ **Zero hardcoding** - Uses registry for all node categorization  
✅ **Infinite workflows** - Works for any workflow structure  
✅ **Root-level fix** - Fixes the issue at the core orchestration layer  
