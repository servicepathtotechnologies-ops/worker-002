# Root Cause Analysis: "Intent has no actions or data sources"

## 🔍 Problem Summary

**Error**: `Intent has no actions or data sources - will be expanded by intent_auto_expander`

**Log Evidence**:
- Line 793: `[IntentAwarePlanner] Determined 0 required nodes`
- Line 815: `[PipelineOrchestrator] ✅ Intent-Aware Planner generated StructuredIntent: 0 nodes`
- **NO log**: `[IntentAwarePlanner] 🔒 Enforcing X mandatory node(s)` ← **This is missing!**

---

## 🚨 Root Cause #1: `determineRequiredNodes()` Ignores `providers` Field

### Problem

**File**: `worker/src/services/ai/intent-aware-planner.ts`  
**Method**: `determineRequiredNodes()` (lines 200-274)

**Current Code**:
```typescript
private async determineRequiredNodes(intent: SimpleIntent, originalPrompt?: string) {
  // ✅ Checks sources
  if (intent.sources && intent.sources.length > 0) { ... }
  
  // ✅ Checks transformations
  if (intent.transformations && intent.transformations.length > 0) { ... }
  
  // ✅ Checks destinations
  if (intent.destinations && intent.destinations.length > 0) { ... }
  
  // ✅ Checks conditions
  if (intent.conditions && intent.conditions.length > 0) { ... }
  
  // ❌ MISSING: Does NOT check intent.providers!
}
```

### Why This Breaks

1. **User prompt**: "Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"
2. **LLM extracts** (in SimpleIntent):
   - `providers: ["GitHub", "GitLab", "Bitbucket", "Jenkins"]` ← **Extracted correctly**
   - `sources: []` ← Empty (LLM doesn't know these are sources)
   - `destinations: []` ← Empty (LLM doesn't know these are destinations)
3. **Planner checks**: Only `sources`, `destinations`, `transformations`, `conditions`
4. **Result**: **0 nodes found** because `providers` is ignored!

### Evidence

- SimpleIntent has `providers` field (defined in `simple-intent.ts` line 71)
- IntentExtractor extracts providers (line 154 in `intent-extractor.ts`)
- But `determineRequiredNodes()` **never checks** `intent.providers`

---

## 🚨 Root Cause #2: `mandatoryNodes` Not Being Passed or Empty

### Problem

**Expected Behavior**:
- Keyword extraction should extract: `github`, `gitlab`, `bitbucket`, `jenkins` from original prompt
- These should be passed as `mandatoryNodes` to `planWorkflow()`
- Planner should enforce them even if SimpleIntent doesn't have them

**Actual Behavior**:
- **NO log message**: `[IntentAwarePlanner] 🔒 Enforcing X mandatory node(s)`
- This means `mandatoryNodes` is either:
  - Not being passed to `planWorkflow()`
  - Or is `undefined`/`[]`

### Why This Happens

1. **Original prompt**: "Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"
2. **Selected variation**: "Start the workflow with manual_trigger..." (completely different!)
3. **Keyword extraction** runs on **original prompt** → extracts: `github`, `gitlab`, `bitbucket`, `jenkins`
4. **But**: These are stored in `(req as any).mandatoryNodeTypes`
5. **Problem**: When user selects a **different variation**, the mandatory nodes from original prompt might not be passed correctly

### Evidence

- Log shows keyword extraction found nodes (line 85-98 in terminal)
- But no enforcement log in planner
- This means `mandatoryNodes` parameter is empty/undefined

---

## 🚨 Root Cause #3: Prompt Variation Doesn't Match Original Intent

### Problem

**Original User Prompt**:
```
"Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"
```

**Selected Prompt Variation** (from summarize layer):
```
"Start the workflow with manual_trigger to begin automation. 
Use loop to iterate through multiple records for processing. 
Configure oauth2_auth to authenticate API requests and retrieve necessary data. 
Transform processed information using log_output for detailed logging and monitoring. 
Finally, export results to github for version control and archiving."
```

**Mismatch**:
- Original mentions: `github`, `gitlab`, `bitbucket`, `jenkins` (4 nodes)
- Variation mentions: `manual_trigger`, `loop`, `oauth2_auth`, `log_output`, `github` (5 nodes, only 1 matches)
- **The variation completely changed the intent!**

### Why This Breaks

1. Keyword extraction extracts nodes from **original prompt**
2. User selects a **different variation** that doesn't mention those nodes
3. System uses **selected variation** for SimpleIntent extraction
4. SimpleIntent from variation doesn't have the original nodes
5. Mandatory nodes from original aren't enforced (or aren't passed)

---

## 📊 Flow Analysis

### Current Flow (Broken)

```
1. Original Prompt: "Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"
   ↓
2. Keyword Extraction: Extracts [github, gitlab, bitbucket, jenkins]
   ↓
3. Summarize Layer: Generates variations (different from original!)
   ↓
4. User Selects Variation: "Start workflow with manual_trigger..."
   ↓
5. SimpleIntent Extraction: Uses SELECTED VARIATION (not original!)
   - providers: [] (variation doesn't mention gitlab, bitbucket, jenkins)
   ↓
6. determineRequiredNodes(): 
   - Checks sources: [] → 0 nodes
   - Checks destinations: [] → 0 nodes
   - Checks transformations: [] → 0 nodes
   - Checks providers: ❌ NOT CHECKED → 0 nodes
   ↓
7. enforceMandatoryNodes():
   - mandatoryNodes: [] or undefined → No enforcement
   ↓
8. Result: 0 nodes → Error!
```

### Expected Flow (Fixed)

```
1. Original Prompt: "Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"
   ↓
2. Keyword Extraction: Extracts [github, gitlab, bitbucket, jenkins]
   ↓
3. SimpleIntent Extraction: Uses ORIGINAL PROMPT (or selected + original context)
   - providers: ["GitHub", "GitLab", "Bitbucket", "Jenkins"]
   ↓
4. determineRequiredNodes(): 
   - Checks providers: ✅ ["GitHub", "GitLab", "Bitbucket", "Jenkins"] → 4 nodes
   ↓
5. enforceMandatoryNodes():
   - mandatoryNodes: [github, gitlab, bitbucket, jenkins] → Enforced
   ↓
6. Result: 4+ nodes → Success!
```

---

## ✅ Solutions Required

### Fix #1: Check `providers` in `determineRequiredNodes()`

**Location**: `worker/src/services/ai/intent-aware-planner.ts`  
**Method**: `determineRequiredNodes()` (after line 271)

**Add**:
```typescript
// Map providers to nodes (they can be sources, destinations, or both)
if (intent.providers && intent.providers.length > 0) {
  for (const provider of intent.providers) {
    // Try to map provider to node type
    const nodeType = await this.mapEntityToNodeType(provider, 'dataSource', originalPrompt);
    if (nodeType && !nodeIds.has(nodeType)) {
      // Determine category based on context
      const category = this.determineProviderCategory(provider, intent, originalPrompt);
      nodes.push({
        id: `prov_${nodes.length}`,
        type: nodeType,
        operation: category === 'dataSource' ? 'read' : 'send',
        category,
      });
      nodeIds.add(nodeType);
    }
  }
}
```

### Fix #2: Ensure `mandatoryNodes` is Always Passed

**Location**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`  
**Line**: 598-605

**Check**: Ensure `mandatoryNodes` is extracted from request and passed to planner

**Add logging**:
```typescript
const mandatoryNodes = options?.mandatoryNodeTypes || [];
console.log(`[PipelineOrchestrator] 🔍 Mandatory nodes received: ${mandatoryNodes.length} node(s): ${mandatoryNodes.join(', ')}`);
```

### Fix #3: Use Original Prompt for SimpleIntent When Variation Changes Intent

**Location**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`  
**Line**: 555

**Change**: Use original prompt for SimpleIntent extraction if selected variation doesn't contain mandatory nodes

---

## 🎯 Summary

**Three Problems**:
1. ❌ `determineRequiredNodes()` doesn't check `intent.providers`
2. ❌ `mandatoryNodes` not being passed or is empty
3. ❌ Selected variation doesn't match original intent

**Impact**: All three problems combine to cause 0 nodes → workflow generation fails

**Priority**: Fix #1 is **CRITICAL** - providers field is extracted but never used!
