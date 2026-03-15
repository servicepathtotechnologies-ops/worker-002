# ✅ Explicit Intent Preservation - Implementation Plan

## 🎯 Goal
Fix the issue where explicitly mentioned nodes in selected variations are replaced with "alternatives" (e.g., Slack → Discord), ensuring user intent is preserved throughout workflow generation.

---

## 🔍 Root Causes Identified

### **Root Cause #1**: Alternative Selection After User Selection
- **Location**: `summarize-layer.ts` line 2106-2124
- **Problem**: `getAlternativeForVariation()` replaces nodes even after user selects a variation
- **Impact**: Slack → Discord replacement violates explicit user intent

### **Root Cause #2**: Overly Generic Capability-Based Equivalence
- **Location**: `semantic-equivalence-auto-generator.ts` line 182-242
- **Problem**: Generic capabilities (`send_message`, `output`) create false equivalences
- **Impact**: Slack and Discord marked as equivalent when they're different services

### **Root Cause #3**: Missing Explicit Intent Tracking
- **Location**: `summarize-layer.ts` line 2128-2160
- **Problem**: No check if node was explicitly mentioned in selected variation
- **Impact**: System doesn't know which nodes to preserve vs. which can be alternatives

---

## 📋 Implementation Plan

### **PHASE 1: Prevent Overly Generic Capability Equivalences** ✅

**Priority**: HIGH (Prevents false equivalences at source)

**File**: `worker/src/core/registry/semantic-equivalence-auto-generator.ts`

**Changes**:

1. **Enhance EXCLUDED_CAPABILITIES** (Line 189-191)
   ```typescript
   const EXCLUDED_CAPABILITIES = new Set<string>([
     'terminal',
     'output',           // ✅ NEW: Too generic - spans different services
     'send_message',     // ✅ NEW: Too generic - Slack ≠ Discord ≠ Telegram
     'communication',    // ✅ NEW: Too generic - different communication channels
     'notification',     // ✅ NEW: Too generic - different notification services
     'write_data',       // ✅ NEW: Too generic - different write targets
   ]);
   ```

2. **Add Service-Specific Capability Exclusion** (New method)
   ```typescript
   /**
    * Check if capability is service-specific (should not create equivalence)
    * 
    * Some capabilities are too generic and span fundamentally different services.
    * Example: 'send_message' is used by Slack, Discord, Telegram - but they're NOT equivalent.
    */
   private isServiceSpecificCapability(capability: string): boolean {
     const normalized = capability.toLowerCase();
     
     // Generic capabilities that span different services
     const genericCapabilities = [
       'send_message',    // Slack, Discord, Telegram all have this
       'output',           // Too broad
       'communication',   // Too broad
       'notification',    // Too broad
       'write_data',      // Too broad (sheets, database, crm all have this)
     ];
     
     return genericCapabilities.includes(normalized);
   }
   ```

3. **Update Capability-Based Generation** (Line 194-207)
   ```typescript
   schemas.forEach(schema => {
     const capabilities = schema.capabilities || [];
     capabilities.forEach((cap: string) => {
       const normalizedCap = cap.toLowerCase();
       
       // Skip excluded/meta capabilities
       if (EXCLUDED_CAPABILITIES.has(normalizedCap)) {
         return;
       }
       
       // ✅ NEW: Skip service-specific capabilities
       if (this.isServiceSpecificCapability(normalizedCap)) {
         return;
       }
       
       // ... rest of code
     });
   });
   ```

**Why**: Prevents Slack ↔ Discord equivalence at the source.

---

### **PHASE 2: Add Explicit Intent Tracking** ✅

**Priority**: HIGH (Core fix for intent preservation)

**File**: `worker/src/services/ai/summarize-layer.ts`

**Changes**:

1. **Add Explicit Intent Parameter to buildWorkflowChain** (Line 2032)
   ```typescript
   private buildWorkflowChain(
     requiredNodes: ReturnType<typeof this.identifyRequiredNodesFromIntent>,
     categorizedNodes: ReturnType<typeof this.categorizeExtractedNodes>,
     triggerType: string,
     userPrompt: string,
     allExtractedNodes: string[],
     variationIndex: number = 0,
     explicitNodeTypes?: string[] // ✅ NEW: Nodes explicitly mentioned in selected variation
   ): string[] {
   ```

2. **Track Explicit Nodes from Selected Variation** (New method)
   ```typescript
   /**
    * ✅ WORLD-CLASS: Extract explicitly mentioned node types from variation text
    * This preserves user intent - nodes explicitly mentioned should NOT be replaced
    * 
    * @param variationText - The selected variation text
    * @param allKeywordData - All keyword mappings
    * @returns Set of node types explicitly mentioned in variation
    */
   private extractExplicitNodeTypesFromVariation(
     variationText: string,
     allKeywordData: AliasKeyword[]
   ): Set<string> {
     const explicitNodes = new Set<string>();
     const variationLower = variationText.toLowerCase();
     
     // Find all node types mentioned in variation text
     for (const keywordData of allKeywordData) {
       const keywordLower = keywordData.keyword.toLowerCase();
       
       // Check if keyword appears in variation text
       // Use word boundary matching to avoid false positives
       const regex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
       if (regex.test(variationText)) {
         explicitNodes.add(keywordData.nodeType);
         console.log(`[AIIntentClarifier] ✅ Explicit node detected in variation: "${keywordData.nodeType}" (keyword: "${keywordData.keyword}")`);
       }
     }
     
     return explicitNodes;
   }
   ```

3. **Modify getAlternativeForVariation to Respect Explicit Intent** (Line 2106-2124)
   ```typescript
   // Helper: Get alternative node for variation diversity
   // ✅ WORLD-CLASS: Respects explicit intent - if node is explicitly mentioned, use it as-is
   const getAlternativeForVariation = (
     nodeType: string, 
     variationIdx: number,
     explicitNodeTypes?: Set<string> // ✅ NEW: Explicit nodes from selected variation
   ): string => {
     // ✅ CRITICAL: If node is explicitly mentioned in selected variation, use it as-is
     if (explicitNodeTypes && explicitNodeTypes.has(nodeType)) {
       console.log(`[AIIntentClarifier] ✅ Preserving explicit node: ${nodeType} (mentioned in selected variation)`);
       return nodeType; // Use exact node, no alternative
     }
     
     // Get all semantically equivalent nodes
     const equivalents = semanticNodeEquivalenceRegistry.getEquivalents(nodeType);
     if (equivalents.length === 0) {
       return nodeType; // No alternatives, use original
     }
     
     // Include the canonical type in alternatives
     const canonical = getCanonical(nodeType);
     const allAlternatives = [canonical, ...equivalents];
     
     // ✅ CRITICAL: Filter out explicit nodes from alternatives
     // If user explicitly mentioned Slack, don't offer Discord as alternative
     if (explicitNodeTypes) {
       const filteredAlternatives = allAlternatives.filter(alt => !explicitNodeTypes.has(alt));
       if (filteredAlternatives.length > 0) {
         // Use variation index to select different alternative for each variation
         const selectedIndex = variationIdx % filteredAlternatives.length;
         const selected = filteredAlternatives[selectedIndex];
         console.log(`[AIIntentClarifier] 🔄 Variation ${variationIdx + 1}: Using alternative "${selected}" for "${nodeType}" (explicit nodes excluded)`);
         return selected;
       }
     }
     
     // Use variation index to select different alternative for each variation
     const selectedIndex = variationIdx % allAlternatives.length;
     const selected = allAlternatives[selectedIndex];
     
     console.log(`[AIIntentClarifier] 🔄 Variation ${variationIdx + 1}: Using alternative "${selected}" for "${nodeType}" (from ${allAlternatives.length} alternatives)`);
     return selected;
   };
   ```

4. **Update addNodeToChain to Pass Explicit Intent** (Line 2149)
   ```typescript
   // ✅ VARIATION DIVERSITY: Use different alternatives across variations
   // ✅ WORLD-CLASS: Respects explicit intent - preserves explicitly mentioned nodes
   const alternativeNode = getAlternativeForVariation(nodeType, variationIndex, explicitNodeTypes);
   ```

5. **Update buildWorkflowChain Call Site** (Find where it's called)
   ```typescript
   // When building chain from selected variation, extract explicit nodes
   const explicitNodeTypes = this.extractExplicitNodeTypesFromVariation(selectedVariationText, allKeywordData);
   
   const chain = this.buildWorkflowChain(
     requiredNodes,
     categorizedNodes,
     triggerType,
     userPrompt,
     allExtractedNodes,
     variationIndex,
     explicitNodeTypes // ✅ NEW: Pass explicit nodes
   );
   ```

**Why**: Preserves explicitly mentioned nodes, only uses alternatives for non-explicit nodes.

---

### **PHASE 3: Add Explicit Exclusion for Distinct Services** ✅

**Priority**: MEDIUM (Additional safety net)

**File**: `worker/src/core/registry/semantic-node-equivalence-registry.ts`

**Changes**:

1. **Add Explicit Service Exclusions** (Line 107, in `initializeEquivalences()`)
   ```typescript
   // ============================================
   // EXPLICIT SERVICE EXCLUSIONS
   // ============================================
   // ✅ CRITICAL: These services are fundamentally different and should NEVER be equivalent
   // Even if they share capabilities, they are distinct services with different APIs, auth, etc.
   
   // Communication services are NOT equivalent (different platforms, different APIs)
   // Slack ≠ Discord ≠ Telegram ≠ Gmail
   // These are explicitly excluded to prevent false equivalences
   
   // Note: This is a safety net - capability-based auto-generation should already exclude these
   // But explicit exclusion ensures they're never marked as equivalent
   ```

2. **Add Validation Method** (New method)
   ```typescript
   /**
    * ✅ WORLD-CLASS: Check if two node types should NEVER be equivalent
    * 
    * Some services are fundamentally different even if they share capabilities.
    * Example: Slack and Discord both send messages, but they're different platforms.
    * 
    * @param nodeType1 - First node type
    * @param nodeType2 - Second node type
    * @returns true if they should NEVER be equivalent
    */
   private shouldNeverBeEquivalent(nodeType1: string, nodeType2: string): boolean {
     const type1 = nodeType1.toLowerCase();
     const type2 = nodeType2.toLowerCase();
     
     // Communication services are distinct
     const communicationServices = [
       'slack_message', 'slack', 'slack_webhook',
       'discord', 'discord_webhook',
       'telegram', 'telegram_bot',
       'google_gmail', 'gmail', 'email',
       'microsoft_teams', 'teams',
       'whatsapp', 'whatsapp_cloud',
     ];
     
     const isComm1 = communicationServices.some(s => type1.includes(s));
     const isComm2 = communicationServices.some(s => type2.includes(s));
     
     // If both are communication services but different ones, they're NOT equivalent
     if (isComm1 && isComm2 && type1 !== type2) {
       // Check if they're the same service (e.g., slack_message and slack)
       const base1 = communicationServices.find(s => type1.includes(s))?.split('_')[0];
       const base2 = communicationServices.find(s => type2.includes(s))?.split('_')[0];
       
       // Only equivalent if same base service (e.g., slack_message ↔ slack)
       return base1 !== base2;
     }
     
     return false;
   }
   ```

3. **Update areEquivalent to Check Exclusion** (Line 327-342)
   ```typescript
   areEquivalent(
     nodeType1: string,
     nodeType2: string,
     operation?: string,
     category?: string
   ): boolean {
     // ✅ PRODUCTION-READY: Validate inputs
     if (!nodeType1 || !nodeType2) {
       return false;
     }
     
     // ✅ NEW: Check explicit exclusion
     if (this.shouldNeverBeEquivalent(nodeType1, nodeType2)) {
       return false; // Explicitly excluded - never equivalent
     }
     
     const canonical1 = this.getCanonicalType(nodeType1, operation, category);
     const canonical2 = this.getCanonicalType(nodeType2, operation, category);
     
     return canonical1.toLowerCase() === canonical2.toLowerCase();
   }
   ```

**Why**: Additional safety net to prevent false equivalences even if auto-generation creates them.

---

### **PHASE 4: Update Variation Selection Flow** ✅

**Priority**: HIGH (Connects explicit intent to workflow generation)

**File**: `worker/src/services/ai/summarize-layer.ts`

**Changes**:

1. **Find Where Selected Variation is Used** (Search for `selectedStructuredPrompt` or variation selection)

2. **Extract Explicit Nodes Before Building Chain**
   ```typescript
   // When user selects a variation, extract explicit nodes
   const selectedVariation = promptVariations.find(v => v.id === selectedVariationId);
   if (selectedVariation) {
     const allKeywordData = this.keywordCollector.getAllAliasKeywords();
     const explicitNodeTypes = this.extractExplicitNodeTypesFromVariation(
       selectedVariation.prompt,
       allKeywordData
     );
     
     // Pass explicit nodes to workflow generation
     // This ensures explicitly mentioned nodes are preserved
   }
   ```

3. **Update Workflow Generation Pipeline** (Find workflow generation entry point)
   ```typescript
   // Pass explicit nodes through the pipeline
   const workflow = await generateWorkflowWithExplicitIntent(
     selectedVariation.prompt,
     explicitNodeTypes // ✅ NEW: Preserve explicit intent
   );
   ```

**Why**: Ensures explicit intent flows from variation selection to workflow generation.

---

## 🧪 Testing Strategy

### **Test Case 1: Explicit Slack Mention**
- **Input**: "get data from google sheets and analyse it and send to slack"
- **Selected Variation**: "Finalize the workflow by sending results via Slack"
- **Expected**: Workflow contains `slack_message` node, NOT `discord`
- **Verify**: `slack_message` is connected, `discord` is NOT in workflow

### **Test Case 2: Explicit Discord Mention**
- **Input**: "get data and send to discord"
- **Selected Variation**: "Finalize the workflow by sending results via Discord"
- **Expected**: Workflow contains `discord` node, NOT `slack_message`
- **Verify**: `discord` is connected, `slack_message` is NOT in workflow

### **Test Case 3: Generic Output (No Explicit Service)**
- **Input**: "get data and send notification"
- **Selected Variation**: "Finalize the workflow by sending results"
- **Expected**: System can choose any output node (slack, discord, gmail, etc.)
- **Verify**: Alternative selection works for non-explicit nodes

### **Test Case 4: Multiple Explicit Nodes**
- **Input**: "get data from sheets, analyze with ollama, send to slack"
- **Selected Variation**: Mentions all three explicitly
- **Expected**: All three nodes preserved exactly (sheets, ollama, slack)
- **Verify**: No replacements, all nodes connected

### **Test Case 5: Capability Equivalence Still Works**
- **Input**: "analyze data with AI"
- **Selected Variation**: Generic AI mention
- **Expected**: System can choose between ollama, ai_chat_model, etc.
- **Verify**: Alternative selection works for truly equivalent nodes

---

## ✅ Verification Checklist

After implementation, verify:

- [ ] Slack explicitly mentioned → `slack_message` in workflow (NOT discord)
- [ ] Discord explicitly mentioned → `discord` in workflow (NOT slack)
- [ ] Generic output mention → System can choose any output
- [ ] AI nodes still have alternatives (ollama ↔ ai_chat_model)
- [ ] No false equivalences (slack ≠ discord, gmail ≠ slack)
- [ ] Explicit nodes preserved in all workflow types
- [ ] Alternative selection still works for non-explicit nodes

---

## 📊 Implementation Order

1. **Phase 1** (Capability Exclusions) - Prevents false equivalences
2. **Phase 2** (Explicit Intent Tracking) - Core fix for intent preservation
3. **Phase 3** (Explicit Service Exclusions) - Additional safety net
4. **Phase 4** (Variation Selection Flow) - Connects intent to generation

**Total Estimated Time**: 2-3 hours
**Risk Level**: LOW (Additive changes, no breaking changes)

---

## 🎯 Success Criteria

✅ **Universal Fix**: Works for ALL communication nodes (Slack, Discord, Telegram, Gmail, etc.)
✅ **Intent Preservation**: Explicitly mentioned nodes are NEVER replaced
✅ **Alternative Selection**: Still works for non-explicit nodes (maintains variation diversity)
✅ **No False Equivalences**: Distinct services are never marked as equivalent
✅ **Backward Compatible**: Existing workflows continue to work

---

## 📝 Files to Modify

1. ✅ `worker/src/core/registry/semantic-equivalence-auto-generator.ts`
   - Add capability exclusions
   - Add service-specific capability check

2. ✅ `worker/src/services/ai/summarize-layer.ts`
   - Add explicit intent extraction
   - Modify `getAlternativeForVariation()` to respect explicit intent
   - Update `buildWorkflowChain()` to accept explicit nodes

3. ✅ `worker/src/core/registry/semantic-node-equivalence-registry.ts`
   - Add explicit service exclusion check
   - Update `areEquivalent()` to use exclusion

4. ✅ `worker/src/services/workflow-lifecycle-manager.ts` (if needed)
   - Pass explicit nodes through workflow generation pipeline

---

## 🚀 Ready for Implementation

This plan provides a **universal, root-cause fix** that:
- ✅ Preserves explicit user intent
- ✅ Prevents false equivalences
- ✅ Maintains variation diversity for non-explicit nodes
- ✅ Works for ALL node types, not just Slack/Discord

**Status**: ✅ **READY TO IMPLEMENT**
