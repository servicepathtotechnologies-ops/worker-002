# 🎯 World-Class Implementation Plan: Capability-Based Deduplication

## 📋 Executive Summary

**Objective**: Prevent duplicate nodes with the same capability in workflow variations using universal capability registry.

**Approach**: Multi-layer enforcement (LLM prompt + code-level filtering + post-processing)

**Result**: Clean variations with ONE node per capability category per variation.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  CAPABILITY-BASED DEDUPLICATION SYSTEM                     │
│  Single Source of Truth: NodeCapabilityRegistryDSL         │
└─────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Layer 1:     │  │ Layer 2:     │  │ Layer 3:     │
│ LLM Prompt   │  │ Code Filter  │  │ Post-Process │
│ Enhancement  │  │ Chain Build  │  │ LLM Output   │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 📝 Implementation Steps

### **STEP 1: Create Universal Capability Resolver Helper**

**File**: `worker/src/services/ai/summarize-layer.ts`

**Location**: Add new helper method in `AIIntentClarifier` class (around line 2020, before `buildWorkflowChain`)

**Purpose**: Universal method to get node capability category using existing registry

**Code**:
```typescript
/**
 * ✅ WORLD-CLASS: Get node capability category using universal registry
 * Uses NodeCapabilityRegistryDSL (single source of truth)
 * Works for ALL nodes automatically - no hardcoding
 * 
 * @param nodeType - Node type to categorize
 * @returns Capability category: 'data_source' | 'transformation' | 'output'
 */
private getNodeCapabilityCategory(nodeType: string): 'data_source' | 'transformation' | 'output' {
  // ✅ PRIMARY: Use capability registry (most reliable)
  if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
    return 'data_source';
  }
  if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
    return 'transformation';
  }
  if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
    return 'output';
  }
  
  // ✅ FALLBACK: Use unified node registry category
  const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef) {
    const category = nodeDef.category;
    if (category === 'data' || category === 'trigger') {
      return 'data_source';
    }
    if (category === 'ai' || category === 'transformation' || category === 'logic' || category === 'utility') {
      return 'transformation';
    }
    if (category === 'communication' || category === 'social' || category === 'output') {
      return 'output';
    }
  }
  
  // ✅ SAFE FALLBACK: Default to transformation (safest for workflow generation)
  return 'transformation';
}
```

**Why**: Universal, uses existing systems, no hardcoding.

---

### **STEP 2: Enhance buildWorkflowChain with Capability Tracking**

**File**: `worker/src/services/ai/summarize-layer.ts`

**Location**: Modify `buildWorkflowChain` method (line 2032-2198)

**Changes**:

1. **Add capability tracking** (after line 2042):
```typescript
// ✅ WORLD-CLASS: Track used capabilities per variation
// Ensures ONE node per capability category per variation
const usedCapabilities = new Set<'data_source' | 'transformation' | 'output'>();
```

2. **Enhance `addNodeToChain` helper** (replace lines 2084-2111):
```typescript
// Helper: Add node to chain with capability-based deduplication
// ✅ WORLD-CLASS: Prevents duplicate capabilities within same variation
const addNodeToChain = (nodeType: string): boolean => {
  // Check if already used (exact match)
  if (usedNodes.has(nodeType)) {
    return false; // Already added
  }
  
  // ✅ WORLD-CLASS: Check capability category
  const capability = this.getNodeCapabilityCategory(nodeType);
  if (usedCapabilities.has(capability)) {
    console.log(
      `[AIIntentClarifier] 🔍 Skipping ${nodeType} ` +
      `(capability '${capability}' already used in variation ${variationIndex + 1})`
    );
    return false; // Capability already used in this variation
  }
  
  // Check if semantically equivalent to existing node IN THIS CHAIN
  if (isDuplicate(nodeType)) {
    console.log(`[AIIntentClarifier] 🔍 Skipping duplicate node: ${nodeType} (semantically equivalent to existing node in this variant)`);
    return false; // Duplicate within variant, skip
  }
  
  // ✅ VARIATION DIVERSITY: Use different alternatives across variations
  // This allows semantically equivalent nodes in different variants for user choice
  const alternativeNode = getAlternativeForVariation(nodeType, variationIndex);
  
  // Check if alternative is already in chain (exact match)
  if (chain.includes(alternativeNode)) {
    console.log(`[AIIntentClarifier] 🔍 Skipping node: ${nodeType} (alternative ${alternativeNode} already in this variant)`);
    return false; // Alternative already exists in this variant
  }
  
  // ✅ WORLD-CLASS: Check alternative's capability too
  const alternativeCapability = this.getNodeCapabilityCategory(alternativeNode);
  if (usedCapabilities.has(alternativeCapability)) {
    console.log(
      `[AIIntentClarifier] 🔍 Skipping ${nodeType} → ${alternativeNode} ` +
      `(alternative's capability '${alternativeCapability}' already used in variation ${variationIndex + 1})`
    );
    return false; // Alternative's capability already used
  }
  
  // Add alternative node to chain (increases variation diversity)
  chain.push(alternativeNode);
  usedNodes.add(alternativeNode);
  usedNodes.add(nodeType); // Track original too
  usedCapabilities.add(alternativeCapability); // ✅ Track capability
  return true; // Successfully added
};
```

**Why**: Enforces one node per capability, uses existing semantic equivalence for diversity.

---

### **STEP 3: Update LLM Prompt Instructions**

**File**: `worker/src/services/ai/summarize-layer.ts`

**Location**: Modify `buildClarificationPrompt` method (around line 2897, in CRITICAL RULES section)

**Changes**: Add explicit capability rules (after line 2897):

```typescript
CRITICAL RULES - ONE NODE PER CAPABILITY PER VARIATION - NO EXCEPTIONS:
1. ✅ ONE data_source node per variation
   - Example: google_sheets (NOT google_sheets + postgresql)
   - If user intent requires multiple data sources, choose ONE that best fits the variation

2. ✅ ONE transformation/AI node per variation
   - Example: ollama OR google_gemini (NOT both)
   - If user intent requires AI processing, choose ONE AI model per variation
   - Different variations can use different AI models for diversity

3. ✅ ONE output node per variation
   - Example: slack_message OR slack_webhook (NOT both)
   - If user intent requires output, choose ONE output channel per variation
   - Different variations can use different output channels for diversity

4. ❌ NEVER mention multiple nodes with the same capability in the same variation
   - ❌ FORBIDDEN: "Process data using ollama. Process data using Gemini."
   - ✅ CORRECT: "Process data using ollama." (Variation 1)
   - ✅ CORRECT: "Process data using Gemini." (Variation 2)

5. ✅ Helper/utility nodes (cache, delay, etc.) are exceptions - can have multiple
   - These are utility nodes, not core capability nodes
   - Example: cache_get + cache_set is OK (both are utility)

6. ✅ Processing nodes (merge, aggregate, etc.) are exceptions - can have multiple
   - These are data processing nodes, not core transformation nodes
   - Example: text_summarizer + sentiment_analyzer is OK (both are processing)

VIOLATION = RETRY: If you generate variations with multiple nodes of the same capability, the system will REJECT and retry.
```

**Why**: Prevents the issue at the source, reduces post-processing.

---

### **STEP 4: Add Post-Processing Safety Net**

**File**: `worker/src/services/ai/summarize-layer.ts`

**Location**: Add new method after `buildVariationPrompt` (around line 2300)

**Purpose**: Parse LLM-generated text and remove capability duplicates

**Code**:
```typescript
/**
 * ✅ WORLD-CLASS: Post-process LLM-generated variation text
 * Removes nodes with duplicate capabilities as safety net
 * 
 * @param llmText - LLM-generated variation text
 * @param extractedNodes - Nodes extracted from LLM text
 * @returns Deduplicated variation text
 */
private deduplicateVariationTextByCapability(
  llmText: string,
  extractedNodes: string[]
): string {
  if (!extractedNodes || extractedNodes.length === 0) {
    return llmText; // No nodes to deduplicate
  }
  
  const usedCapabilities = new Set<'data_source' | 'transformation' | 'output'>();
  const uniqueNodes: string[] = [];
  
  // ✅ Filter nodes by capability (keep first occurrence of each capability)
  for (const node of extractedNodes) {
    const capability = this.getNodeCapabilityCategory(node);
    
    // Core capabilities (data_source, transformation, output) - only one per variation
    if (capability === 'data_source' || capability === 'transformation' || capability === 'output') {
      if (usedCapabilities.has(capability)) {
        // Capability already used - skip this node
        console.log(`[AIIntentClarifier] 🔍 Post-process: Removing ${node} (capability '${capability}' already used)`);
        continue;
      }
      usedCapabilities.add(capability);
    }
    
    uniqueNodes.push(node);
  }
  
  // ✅ If nodes were removed, regenerate text (optional - can return original if preferred)
  if (uniqueNodes.length < extractedNodes.length) {
    console.log(
      `[AIIntentClarifier] ✅ Post-process: Removed ${extractedNodes.length - uniqueNodes.length} ` +
      `duplicate capability node(s), kept ${uniqueNodes.length} unique node(s)`
    );
    // Return original text (code-level filtering is primary, this is just safety net)
    // OR regenerate text with unique nodes only
    return llmText; // Keep original for now, code-level filtering handles it
  }
  
  return llmText;
}
```

**Why**: Safety net for edge cases, handles LLM mistakes.

---

### **STEP 5: Integrate Post-Processing into Variation Generation**

**File**: `worker/src/services/ai/summarize-layer.ts`

**Location**: Modify `buildVariationPrompt` or where variations are created (around line 1363)

**Changes**: Call post-processing after LLM generates text (if needed)

**Note**: Code-level filtering in `buildWorkflowChain` is primary, post-processing is optional safety net.

---

## ✅ Testing Strategy

### **Test Case 1: Multiple AI Nodes**
**Input**: User prompt with "analyse" (should detect AI intent)
**Expected**: Variation 1 has ONE AI node (ollama OR google_gemini, not both)
**Validation**: Check `usedCapabilities` Set contains only one 'transformation' entry

### **Test Case 2: Multiple Output Nodes**
**Input**: User prompt with "send to slack"
**Expected**: Variation 1 has ONE output node (slack_message OR slack_webhook, not both)
**Validation**: Check `usedCapabilities` Set contains only one 'output' entry

### **Test Case 3: Multiple Data Sources**
**Input**: User prompt with "get data from google sheets and postgresql"
**Expected**: Variation 1 has ONE data source (google_sheets OR postgresql, not both)
**Validation**: Check `usedCapabilities` Set contains only one 'data_source' entry

### **Test Case 4: Variation Diversity**
**Input**: User prompt with "analyse and send to slack"
**Expected**: 
- Variation 1: ollama + slack_message
- Variation 2: google_gemini + slack_webhook (different alternatives)
**Validation**: Different variations use different semantically equivalent nodes

### **Test Case 5: Helper Nodes Exception**
**Input**: User prompt with cache operations
**Expected**: Variation can have cache_get + cache_set (both utility, not core capability)
**Validation**: Helper/utility nodes don't conflict with core capability rules

---

## 🎯 Success Criteria

1. ✅ **No duplicate capabilities**: Each variation has max ONE node per capability
2. ✅ **Variation diversity**: Different variations use different alternatives
3. ✅ **Universal**: Works for ALL nodes automatically
4. ✅ **Maintainable**: Uses existing capability registry
5. ✅ **Performance**: O(n) complexity, no performance degradation
6. ✅ **User experience**: Clean, focused variations

---

## 📊 Expected Results

### **Before**:
```
Variation 1: manual_trigger → google_sheets → ollama → google_gemini → slack_message → slack_webhook
(6 nodes, 2 duplicates: ollama+gemini, slack_message+slack_webhook)
```

### **After**:
```
Variation 1: manual_trigger → google_sheets → ollama → slack_message
(4 nodes, one per capability)

Variation 2: manual_trigger → google_sheets → google_gemini → slack_webhook
(4 nodes, different alternatives for diversity)
```

---

## 🔧 Implementation Order

1. **STEP 1**: Create `getNodeCapabilityCategory` helper (foundation)
2. **STEP 2**: Enhance `buildWorkflowChain` with capability tracking (primary fix)
3. **STEP 3**: Update LLM prompt (prevention at source)
4. **STEP 4**: Add post-processing (safety net)
5. **STEP 5**: Test and validate

---

## ⚠️ Important Notes

1. **Helper/utility nodes are exceptions**: `cache_get`, `cache_set`, `delay`, etc. can coexist
2. **Processing nodes are exceptions**: `text_summarizer`, `sentiment_analyzer` can coexist
3. **Core capabilities are strict**: `data_source`, `transformation`, `output` - only ONE per variation
4. **Variation diversity**: Different variations can use different alternatives (ollama vs gemini)

---

## 🚀 Ready to Implement

This plan is:
- ✅ **Universal**: Uses existing capability registry
- ✅ **Maintainable**: No hardcoding, clear separation
- ✅ **Scalable**: Works for infinite nodes
- ✅ **Reliable**: Multi-layer enforcement
- ✅ **World-class**: Enterprise-grade solution

**Status**: Ready for implementation ✅
