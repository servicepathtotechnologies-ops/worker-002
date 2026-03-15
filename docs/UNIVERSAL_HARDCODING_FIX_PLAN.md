# Universal Hardcoding Elimination Plan

## Overview
This document tracks the systematic elimination of ALL hardcoded node names across the entire codebase to make it 100% registry-driven.

## Files with Hardcoded Node Logic (Priority Order)

### 🔴 CRITICAL - Core Logic Files

1. **worker/src/services/step-node-mapper.ts**
   - Hardcoded: `ACTION_TO_NODE_MAP`, `TRIGGER_TYPE_MAP`, `INTEGRATION_KEYWORDS`
   - Fix: Use registry to map actions to nodes dynamically

2. **worker/src/core/utils/node-handle-registry.ts**
   - Hardcoded: `NODE_HANDLE_REGISTRY` with all node types
   - Fix: Generate handle registry from unified-node-registry

3. **worker/src/services/ai/workflow-builder.ts**
   - Hardcoded: `initializeNodeLibrary()` with hardcoded node list
   - Fix: Use unified-node-registry instead

4. **worker/src/services/workflow-lifecycle-manager.ts**
   - Hardcoded: `if (nodeType === 'if_else')` checks
   - Fix: Use registry to check node capabilities

5. **worker/src/services/ai/workflow-builder.ts** (lines 2652, 2690)
   - Hardcoded: Trigger checks, if_else checks
   - Fix: Use registry-based detection

### 🟡 HIGH - AI Service Files

6. **worker/src/services/ai/step-to-node-mapper.ts**
   - Hardcoded: Node type mappings in switch statements
   - Fix: Use registry-based mapping

7. **worker/src/services/ai/intent-aware-planner.ts**
   - Check for hardcoded node checks
   - Fix: Use registry

### 🟢 MEDIUM - Supporting Files

8. **worker/src/services/ai/workflow-validation-pipeline.ts**
9. **worker/src/services/ai/workflow-dsl-compiler.ts**
10. **worker/src/services/ai/workflow-pipeline-orchestrator.ts**
11. **worker/src/services/ai/safety-node-injector.ts**

## Implementation Strategy

### Phase 1: Core Infrastructure (Current)
- ✅ Fixed: `summarize-layer.ts` - All hardcoded patterns removed
- ✅ Fixed: `universal-variation-node-categorizer.ts` - Already universal

### Phase 2: Core Mapping Files
- [ ] Fix `step-node-mapper.ts` - Make action-to-node mapping registry-driven
- [ ] Fix `node-handle-registry.ts` - Generate from registry
- [ ] Fix `workflow-builder.ts` - Remove hardcoded node library

### Phase 3: Conditional Logic Files
- [ ] Fix `workflow-lifecycle-manager.ts` - Registry-based node checks
- [ ] Fix `workflow-builder.ts` - Registry-based trigger/conditional checks
- [ ] Fix `step-to-node-mapper.ts` - Registry-based mappings

### Phase 4: Validation & Verification
- [ ] Search entire codebase for remaining hardcoded patterns
- [ ] Verify all fixes work with infinite workflows
- [ ] Test with new node types

## Success Criteria

✅ Zero hardcoded node names in conditional logic
✅ All node selection uses unified-node-registry
✅ System works for infinite workflows automatically
✅ New nodes work without code changes
