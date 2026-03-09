# Stages 4-12 Verification Plan

## Overview

This document outlines the verification plan for Stages 4-12 of the workflow generation pipeline, ensuring keywords from Stage 1 flow correctly through all stages.

---

## Stage 4: IntentAwarePlanner Enhancement ✅

### Status: IN PROGRESS

### Changes Made:
1. ✅ Updated `planWorkflow()` to accept `mandatoryNodes` parameter
2. ✅ Added `enforceMandatoryNodes()` method to ensure mandatory nodes are included
3. ✅ Updated pipeline orchestrator to pass mandatory nodes to IntentAwarePlanner

### Verification Points:
- [ ] IntentAwarePlanner receives mandatory nodes from pipeline
- [ ] `enforceMandatoryNodes()` adds missing mandatory nodes
- [ ] Mandatory nodes are included in `nodeRequirements`
- [ ] Dependency graph includes mandatory nodes
- [ ] Execution order includes mandatory nodes

---

## Stage 4: Dependency Graph Building

### Verification Points:
- [ ] Explicit keywords create correct dependencies
- [ ] Topological sort works with explicit nodes
- [ ] Execution order is correct
- [ ] Mandatory nodes are in correct order

### Key Files:
- `worker/src/services/ai/intent-aware-planner.ts` - `buildDependencyGraph()`
- `worker/src/services/ai/intent-aware-planner.ts` - `determineExecutionOrder()`

---

## Stage 5: StructuredIntent Building

### Verification Points:
- [ ] All keywords from Stage 1 are included
- [ ] Validate against mandatory nodes
- [ ] Ensure no missing nodes
- [ ] StructuredIntent contains all required nodes

### Key Files:
- `worker/src/services/ai/intent-aware-planner.ts` - `buildStructuredIntent()`

---

## Stage 6: DSL Generation

### Verification Points:
- [ ] DSL includes all required nodes
- [ ] Execution order is correct
- [ ] Duplicate operation prevention works
- [ ] Mandatory nodes are in DSL

### Key Files:
- `worker/src/services/ai/dsl-generator.ts` (if exists)
- `worker/src/services/ai/workflow-structure-builder.ts`

---

## Stage 7: Graph Compilation

### Verification Points:
- [ ] Nodes are connected in structured order (trigger → dataSource → transformation → output)
- [ ] Semantic ordering works
- [ ] Linear pipeline building works
- [ ] Mandatory nodes are connected

### Key Files:
- `worker/src/services/graph/graph-connectivity-builder.ts`
- `worker/src/services/ai/workflow-structure-builder.ts`

---

## Stage 8: Graph Sanitization

### Verification Points:
- [ ] Duplicate node removal works
- [ ] Semantic duplicate detection works
- [ ] Category duplication prevention works
- [ ] Mandatory nodes are not removed

### Key Files:
- `worker/src/services/ai/workflow-graph-sanitizer.ts`

---

## Stage 9: Graph Pruning

### Verification Points:
- [ ] Orphan node removal works
- [ ] Disconnected nodes are removed if requirements satisfied
- [ ] Semantic matching for requirement satisfaction works
- [ ] Mandatory nodes are not pruned

### Key Files:
- `worker/src/services/ai/workflow-graph-pruner.ts`

---

## Stage 10: Final Validation

### Verification Points:
- [ ] All required nodes are present
- [ ] Edge validation works
- [ ] Transformation source/destination validation works
- [ ] Mandatory nodes validation passes

### Key Files:
- `worker/src/services/ai/workflow-validation-pipeline.ts`
- `worker/src/services/ai/pre-compilation-validator.ts`

---

## Stage 11: Node Hydration

### Verification Points:
- [ ] Registry-based schema validation works
- [ ] Node configurations are correct
- [ ] Input/output validation works
- [ ] Mandatory nodes are hydrated correctly

### Key Files:
- `worker/src/core/registry/unified-node-registry.ts`
- `worker/src/core/execution/dynamic-node-executor.ts`

---

## Stage 12: Workflow Completion

### Verification Points:
- [ ] Workflow explanation includes all keywords
- [ ] Status is ready
- [ ] Final validation passes
- [ ] All mandatory nodes are in final workflow

### Key Files:
- `worker/src/services/ai/workflow-builder.ts`
- `worker/src/services/workflow-lifecycle-manager.ts`

---

## Testing Strategy

1. **Unit Tests**: Test each stage independently with mandatory nodes
2. **Integration Tests**: Test keyword flow through multiple stages
3. **End-to-End Tests**: Test complete flow from Stage 1 to Stage 12

---

## Success Criteria

- ✅ All mandatory nodes from Stage 1 appear in final workflow
- ✅ No hardcoded logic in any stage
- ✅ All stages use registry-based approach
- ✅ Semantic matching works throughout
- ✅ 90%+ accuracy for workflow generation
