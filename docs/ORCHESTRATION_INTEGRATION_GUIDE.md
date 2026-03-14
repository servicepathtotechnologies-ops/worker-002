# Orchestration Integration Guide

## ✅ Core Orchestration Layer Complete

All 4 core components have been implemented:
1. ✅ `ExecutionOrderManager` - Maintains dynamic execution order
2. ✅ `EdgeReconciliationEngine` - Automatically reconciles edges
3. ✅ `NodeInjectionCoordinator` - Unified API for node injections
4. ✅ `UnifiedGraphOrchestrator` - Main coordinator

## 🔄 Integration Steps

### Step 1: Update SafetyNodeInjector
**File**: `worker/src/services/ai/safety-node-injector.ts`

**Changes Needed**:
- Replace manual edge creation with `unifiedGraphOrchestrator.injectNode()`
- Remove direct edge manipulation
- Use orchestrator for all node injections

**Before**:
```typescript
// Manual edge creation
const edge1 = createEdge(upstreamNode, ifNode, workflow.edges, workflow.nodes);
if (edge1) newEdges.push(edge1);
```

**After**:
```typescript
// Use orchestrator
const result = await unifiedGraphOrchestrator.injectNode(
  workflow,
  ifNode,
  {
    type: 'safety',
    position: 'after',
    referenceNodeId: upstreamNode.id,
    reason: 'Auto-inserted empty-check before AI'
  }
);
workflow = result.workflow;
```

### Step 2: Update DSLCompiler
**File**: `worker/src/services/ai/workflow-dsl-compiler.ts`

**Changes Needed**:
- Use `unifiedGraphOrchestrator.initializeWorkflow()` for initial workflow creation
- Remove manual edge creation from `buildLinearPipeline()`

**Before**:
```typescript
// Manual edge creation
edges = [...edges, {
  id: randomUUID(),
  source: sourceNode.id,
  target: targetNode.id,
  // ...
}];
```

**After**:
```typescript
// Use orchestrator
const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(
  nodes,
  initialExecutionOrder
);
```

### Step 3: Update WorkflowPipelineOrchestrator
**File**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`

**Changes Needed**:
- Use orchestrator for safety node injection
- Use orchestrator for final workflow reconciliation

**Before**:
```typescript
const safety = injectSafetyNodes(workflow, structuredIntent);
workflow = safety.workflow;
```

**After**:
```typescript
// Safety injection now handled by orchestrator internally
// Just call reconcileWorkflow after all injections
const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
workflow = reconciled.workflow;
```

## 📋 Integration Checklist

- [ ] Update SafetyNodeInjector to use orchestrator
- [ ] Update DSLCompiler to use orchestrator
- [ ] Update WorkflowPipelineOrchestrator to use orchestrator
- [ ] Remove old edge creation logic
- [ ] Test with sample workflows
- [ ] Validate linear structure enforcement

## 🎯 Expected Benefits

After integration:
- ✅ All edges automatically correct (no manual fixes)
- ✅ Execution order always up-to-date
- ✅ No orphaned nodes
- ✅ Linear structure enforced by default
- ✅ Branching only for explicit branching nodes
