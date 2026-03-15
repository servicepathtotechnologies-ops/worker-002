# ✅ Explicit Intent Enforcement - Structured Implementation Plan

## 🎯 Goal
Fix the issue where Discord is added to workflows even when user explicitly selects a variation mentioning Slack. Ensure explicit intent is extracted BEFORE DSL generation and enforced throughout the pipeline.

---

## 🔍 Root Causes Identified

1. **Timing Issue**: Explicit extraction happens AFTER DSL generation
2. **No Removal**: Extraction adds explicit nodes but doesn't remove conflicting ones
3. **DSL Priority**: DSL decisions override explicit extraction
4. **Multiple Sources**: Nodes added from different sources aren't reconciled

---

## 📋 Implementation Structure

### **PHASE 1: Move Explicit Extraction to Entry Point** ✅

**Priority**: CRITICAL (Must happen first)

**Goal**: Extract explicit nodes from selected variation BEFORE any DSL generation or node detection

**Files to Modify**:
- `worker/src/api/generate-workflow.ts` - Entry point for workflow generation
- `worker/src/services/workflow-lifecycle-manager.ts` - Workflow generation orchestrator

**Changes**:

1. **In `generate-workflow.ts`** (when user selects variation):
   ```typescript
   // ✅ NEW: Extract explicit nodes IMMEDIATELY when variation is selected
   // This happens BEFORE any workflow generation
   if (selectedPromptVariation) {
     const { AliasKeywordCollector } = await import('./services/ai/summarize-layer');
     const keywordCollector = new AliasKeywordCollector();
     const allKeywordData = keywordCollector.getAllAliasKeywords();
     
     // Extract explicit nodes using word-boundary matching
     const explicitNodeTypes = extractExplicitNodeTypesFromVariation(
       selectedPromptVariation,
       allKeywordData
     );
     
     // ✅ CRITICAL: Store explicit nodes in request context
     (req as any).explicitNodeTypes = explicitNodeTypes;
     (req as any).blockedNodeTypes = getBlockedNodeTypes(explicitNodeTypes); // Discord if Slack is explicit
     
     console.log(`[GenerateWorkflow] ✅ Extracted ${explicitNodeTypes.size} explicit node(s): ${Array.from(explicitNodeTypes).join(', ')}`);
   }
   ```

2. **Pass explicit nodes to workflow generation**:
   ```typescript
   const workflow = await workflowLifecycleManager.generateWorkflowGraph(
     userPrompt,
     {
       selectedStructuredPrompt: selectedPromptVariation,
       originalPrompt: userPrompt,
       explicitNodeTypes: (req as any).explicitNodeTypes, // ✅ NEW
       blockedNodeTypes: (req as any).blockedNodeTypes,   // ✅ NEW
       // ... other constraints
     }
   );
   ```

**Why**: Ensures explicit intent is known BEFORE any node detection or DSL generation.

---

### **PHASE 2: Enforce Explicit Nodes in Node Resolution** ✅

**Priority**: CRITICAL

**Goal**: Prevent conflicting nodes from being detected during node resolution

**Files to Modify**:
- `worker/src/services/ai/node-resolver.ts` - Node detection from prompts
- `worker/src/services/workflow-lifecycle-manager.ts` - Node resolution orchestration

**Changes**:

1. **In `node-resolver.ts`**:
   ```typescript
   resolvePrompt(
     prompt: string,
     contextPrompt?: string,
     options?: {
       explicitNodeTypes?: Set<string>;  // ✅ NEW: Explicit nodes to prioritize
       blockedNodeTypes?: Set<string>;   // ✅ NEW: Nodes to block (conflicting)
     }
   ): ResolutionResult {
     // ... existing detection logic ...
     
     // ✅ CRITICAL: Filter out blocked nodes
     if (options?.blockedNodeTypes) {
       detectedNodes = detectedNodes.filter(node => !options.blockedNodeTypes!.has(node));
       console.log(`[NodeResolver] 🚫 Blocked ${blockedNodes.length} conflicting node(s)`);
     }
     
     // ✅ CRITICAL: Prioritize explicit nodes
     if (options?.explicitNodeTypes) {
       const explicitNodes = detectedNodes.filter(node => options.explicitNodeTypes!.has(node));
       const otherNodes = detectedNodes.filter(node => !options.explicitNodeTypes!.has(node));
       detectedNodes = [...explicitNodes, ...otherNodes]; // Explicit first
       console.log(`[NodeResolver] ✅ Prioritized ${explicitNodes.length} explicit node(s)`);
     }
     
     return { success: true, nodeIds: detectedNodes, errors: [], warnings: [] };
   }
   ```

2. **In `workflow-lifecycle-manager.ts`**:
   ```typescript
   // When calling nodeResolver
   const resolution = nodeResolver.resolvePrompt(
     promptForResolution,
     originalPrompt,
     {
       explicitNodeTypes: constraints?.explicitNodeTypes,  // ✅ NEW
       blockedNodeTypes: constraints?.blockedNodeTypes,   // ✅ NEW
     }
   );
   ```

**Why**: Prevents conflicting nodes from being detected in the first place.

---

### **PHASE 3: Enforce Explicit Nodes in DSL Generation** ✅

**Priority**: CRITICAL

**Goal**: Prevent DSL from adding conflicting nodes

**Files to Modify**:
- `worker/src/services/ai/workflow-dsl.ts` - DSL generation
- `worker/src/services/ai/production-workflow-builder.ts` - Workflow builder that uses DSL

**Changes**:

1. **In `workflow-dsl.ts`** (DSL generation):
   ```typescript
   generateDSL(
     structuredIntent: StructuredIntent,
     options?: {
       explicitNodeTypes?: Set<string>;  // ✅ NEW
       blockedNodeTypes?: Set<string>;   // ✅ NEW
     }
   ): WorkflowDSL {
     // ... existing DSL generation ...
     
     // ✅ CRITICAL: Filter DSL steps to remove blocked nodes
     if (options?.blockedNodeTypes) {
       dsl.steps = dsl.steps.filter(step => {
         const nodeType = step.nodeType || step.type;
         if (options.blockedNodeTypes!.has(nodeType)) {
           console.log(`[WorkflowDSL] 🚫 Blocked conflicting node in DSL: ${nodeType}`);
           return false;
         }
         return true;
       });
     }
     
     // ✅ CRITICAL: Ensure explicit nodes are in DSL
     if (options?.explicitNodeTypes) {
       for (const explicitNode of options.explicitNodeTypes) {
         const exists = dsl.steps.some(step => 
           (step.nodeType || step.type) === explicitNode
         );
         if (!exists) {
           console.log(`[WorkflowDSL] ✅ Adding missing explicit node to DSL: ${explicitNode}`);
           // Add explicit node to DSL
           dsl.steps.push({
             type: explicitNode,
             operation: getDefaultOperation(explicitNode),
             // ... other required fields
           });
         }
       }
     }
     
     return dsl;
   }
   ```

2. **In `production-workflow-builder.ts`**:
   ```typescript
   // When calling generateDSL
   const dsl = workflowDSL.generateDSL(structuredIntent, {
     explicitNodeTypes: options?.explicitNodeTypes,  // ✅ NEW
     blockedNodeTypes: options?.blockedNodeTypes,   // ✅ NEW
   });
   ```

**Why**: Prevents DSL from generating conflicting nodes and ensures explicit nodes are included.

---

### **PHASE 4: Post-DSL Validation and Cleanup** ✅

**Priority**: HIGH (Safety net)

**Goal**: Remove any conflicting nodes that slipped through

**Files to Modify**:
- `worker/src/services/ai/production-workflow-builder.ts` - After DSL compilation
- `worker/src/core/orchestration/edge-reconciliation-engine.ts` - Edge reconciliation

**Changes**:

1. **In `production-workflow-builder.ts`** (after DSL compilation):
   ```typescript
   // After workflow is built from DSL
   if (options?.explicitNodeTypes || options?.blockedNodeTypes) {
     // ✅ CRITICAL: Remove conflicting nodes
     if (options.blockedNodeTypes) {
       workflow.nodes = workflow.nodes.filter(node => {
         if (options.blockedNodeTypes!.has(node.type)) {
           console.log(`[ProductionWorkflowBuilder] 🚫 Removing conflicting node: ${node.type}`);
           return false;
         }
         return true;
       });
     }
     
     // ✅ CRITICAL: Ensure explicit nodes exist
     if (options.explicitNodeTypes) {
       for (const explicitNode of options.explicitNodeTypes) {
         const exists = workflow.nodes.some(node => node.type === explicitNode);
         if (!exists) {
           console.log(`[ProductionWorkflowBuilder] ✅ Adding missing explicit node: ${explicitNode}`);
           // Add explicit node to workflow
           workflow.nodes.push({
             id: generateId(),
             type: explicitNode,
             data: {
               config: getDefaultConfig(explicitNode),
               // ... other required fields
             },
           });
         }
       }
     }
     
     // ✅ CRITICAL: Reconcile edges after node changes
     const { unifiedGraphOrchestrator } = await import('../../core/orchestration/unified-graph-orchestrator');
     workflow = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
   }
   ```

**Why**: Final safety net to ensure explicit intent is preserved even if earlier steps fail.

---

### **PHASE 5: Improve Keyword Matching Precision** ✅

**Priority**: MEDIUM (Enhancement)

**Goal**: Ensure "slack" matches `slack_message`, not `discord`

**Files to Modify**:
- `worker/src/services/ai/summarize-layer.ts` - Keyword extraction
- `worker/src/services/ai/workflow-pipeline-orchestrator.ts` - Explicit extraction

**Changes**:

1. **Add service-specific keyword mapping**:
   ```typescript
   // ✅ NEW: Service-specific keyword mapping (prevents false matches)
   const SERVICE_KEYWORD_MAP: Record<string, string[]> = {
     'slack_message': ['slack', 'slack message', 'slack webhook', 'slack notification'],
     'discord': ['discord', 'discord bot', 'discord webhook', 'discord message'],
     'telegram': ['telegram', 'telegram bot', 'telegram message'],
     'google_gmail': ['gmail', 'google mail', 'google gmail', 'email'],
     // ... other services
   };
   
   function extractExplicitNodeTypesFromVariation(
     variationText: string,
     allKeywordData: AliasKeyword[]
   ): Set<string> {
     const explicitNodes = new Set<string>();
     const variationLower = variationText.toLowerCase();
     
     // ✅ NEW: Check service-specific keywords first (more precise)
     for (const [nodeType, keywords] of Object.entries(SERVICE_KEYWORD_MAP)) {
       for (const keyword of keywords) {
         const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
         if (regex.test(variationText)) {
           explicitNodes.add(nodeType);
           console.log(`[ExplicitExtraction] ✅ Matched "${keyword}" → ${nodeType}`);
           break; // Found match for this service, move to next
         }
       }
     }
     
     // Fallback to general keyword matching for other nodes
     // ... existing logic ...
     
     return explicitNodes;
   }
   ```

2. **Add blocked node derivation**:
   ```typescript
   // ✅ NEW: Derive blocked nodes from explicit nodes
   function getBlockedNodeTypes(explicitNodeTypes: Set<string>): Set<string> {
     const blocked = new Set<string>();
     
     // Communication service conflicts
     const communicationServices = {
       'slack_message': ['discord', 'telegram', 'google_gmail'],
       'discord': ['slack_message', 'telegram', 'google_gmail'],
       'telegram': ['slack_message', 'discord', 'google_gmail'],
       'google_gmail': ['slack_message', 'discord', 'telegram'],
     };
     
     for (const explicitNode of explicitNodeTypes) {
       const conflicts = communicationServices[explicitNode as keyof typeof communicationServices];
       if (conflicts) {
         conflicts.forEach(conflict => blocked.add(conflict));
       }
     }
     
     console.log(`[ExplicitExtraction] 🚫 Blocked ${blocked.size} conflicting node(s): ${Array.from(blocked).join(', ')}`);
     return blocked;
   }
   ```

**Why**: Ensures precise matching and prevents false positives.

---

## 🔄 Complete Flow (After Implementation)

```
1. User selects variation: "Finalize the workflow by sending results via Slack"
   ↓
2. [PHASE 1] Extract explicit nodes: { slack_message }
   ↓
3. [PHASE 1] Derive blocked nodes: { discord, telegram, google_gmail }
   ↓
4. [PHASE 2] Node resolution with explicit/blocked nodes
   - Detects: slack_message ✅
   - Blocks: discord ❌
   ↓
5. [PHASE 3] DSL generation with explicit/blocked nodes
   - Includes: slack_message ✅
   - Excludes: discord ❌
   ↓
6. [PHASE 4] Post-DSL validation
   - Removes any discord that slipped through ❌
   - Ensures slack_message exists ✅
   ↓
7. Final workflow: Contains slack_message, NO discord ✅
```

---

## 📊 Implementation Order

1. **Phase 1** (30 min) - Move extraction to entry point
2. **Phase 5** (20 min) - Improve keyword matching (needed for Phase 1)
3. **Phase 2** (30 min) - Enforce in node resolution
4. **Phase 3** (40 min) - Enforce in DSL generation
5. **Phase 4** (30 min) - Post-DSL validation

**Total**: ~2.5 hours

---

## ✅ Success Criteria

- ✅ Explicit nodes extracted BEFORE DSL generation
- ✅ Conflicting nodes blocked at node resolution
- ✅ DSL generation respects explicit/blocked nodes
- ✅ Post-DSL validation removes any conflicts
- ✅ Final workflow contains ONLY explicit nodes (no conflicts)

---

## 🧪 Test Cases

1. **Explicit Slack**: Variation mentions "Slack" → Workflow has `slack_message`, NO `discord`
2. **Explicit Discord**: Variation mentions "Discord" → Workflow has `discord`, NO `slack_message`
3. **Explicit Gmail**: Variation mentions "Gmail" → Workflow has `google_gmail`, NO other communication nodes
4. **Generic Output**: Variation says "send notification" → System can choose any output (no conflicts)

---

## 📝 Files to Modify

1. ✅ `worker/src/api/generate-workflow.ts` - Entry point extraction
2. ✅ `worker/src/services/workflow-lifecycle-manager.ts` - Pass explicit nodes
3. ✅ `worker/src/services/ai/node-resolver.ts` - Filter blocked nodes
4. ✅ `worker/src/services/ai/workflow-dsl.ts` - Enforce in DSL
5. ✅ `worker/src/services/ai/production-workflow-builder.ts` - Post-DSL validation
6. ✅ `worker/src/services/ai/summarize-layer.ts` - Keyword matching improvements
7. ✅ `worker/src/services/ai/workflow-pipeline-orchestrator.ts` - Update to use new flow

---

## 🚀 Ready for Implementation

This plan provides a **complete, structured solution** that:
- ✅ Fixes timing issues (extraction before DSL)
- ✅ Prevents conflicts at every stage
- ✅ Provides safety nets
- ✅ Works universally for all node types

**Status**: ✅ **READY TO IMPLEMENT**
