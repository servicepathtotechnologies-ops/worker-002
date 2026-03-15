# 🔍 Complete Keyword Detection Flow Analysis

## Overview

This document explains **exactly** how keywords are collected, matched, and used to detect nodes from user prompts. It answers:
1. Where keywords come from
2. How they're matched against prompts
3. How nodes are selected
4. Whether it's universal or hardcoded
5. Why HubSpot/Gmail detection is failing

---

## 📊 Complete Flow Diagram

```
User Prompt: "Get data from Google Sheets and create a record in hubspot"
    ↓
[1] AliasKeywordCollector.getAllAliasKeywords()
    ↓ Collects from 6 sources:
    ├─ schema.keywords
    ├─ schema.aiSelectionCriteria.keywords
    ├─ schema.aiSelectionCriteria.useCases
    ├─ schema.capabilities
    ├─ node type patterns (aliases)
    └─ semantic equivalents
    ↓
[2] universalNodeDetection() - 6 Detection Methods
    ├─ detectByNodeTypeName() - Direct type match
    ├─ detectByRegistryLabel() - Label match
    ├─ detectByRegistryTags() - Tags/aliases match
    ├─ detectByKeywords() - Uses AliasKeywordCollector ✅
    ├─ detectBySemanticWords() - Description match
    └─ detectByFuzzyMatching() - Typo tolerance
    ↓
[3] classifyIntentType() - EXPLICIT vs CATEGORY
    ↓
[4] groupNodesBySemanticCategory() - Groups by category
    ↓
[5] selectOneNodePerCategoryWithIntentPreservation() - Selects ONE per group
    ↓
[6] mapKeywordsToNodeTypes() - Maps to final node types
    ↓
Result: ['google_sheets', 'hubspot'] (or should be...)
```

---

## 🔑 Step 1: Keyword Collection (AliasKeywordCollector)

**Location**: `worker/src/services/ai/summarize-layer.ts` lines 73-219

### ✅ UNIVERSAL: Collects from 6 Sources

```typescript
getAllAliasKeywords(): AliasKeyword[] {
  // 1. From schema.keywords
  if (schema.keywords && schema.keywords.length > 0) {
    for (const keyword of schema.keywords) {
      keywords.push({ keyword: keyword.toLowerCase(), nodeType: schema.type, source: 'keywords' });
    }
  }

  // 2. From aiSelectionCriteria.keywords
  if (schema.aiSelectionCriteria?.keywords && schema.aiSelectionCriteria.keywords.length > 0) {
    for (const keyword of schema.aiSelectionCriteria.keywords) {
      keywords.push({ keyword: keyword.toLowerCase(), nodeType: schema.type, source: 'aiSelectionCriteria' });
    }
  }

  // 3. From aiSelectionCriteria.useCases (extracts keywords from text)
  // 4. From capabilities (extracts keywords from capability strings)
  // 5. From node type patterns (aliases)
  // 6. From semantic equivalents (post_to_instagram, etc.)
}
```

### ✅ UNIVERSAL: Works for ALL Nodes

- Uses `nodeLibrary.getAllSchemas()` - no hardcoded node lists
- Dynamically collects from ALL node schemas
- **Works for infinite workflows** ✅

### ❌ ISSUE: HubSpot Keywords Too Limited

**Current HubSpot Keywords** (line 5201, 5210):
```typescript
keywords: ['hubspot', 'hub spot'], // ❌ TOO LIMITED
```

**Missing Keywords**:
- ❌ "create in hubspot"
- ❌ "hubspot record"
- ❌ "create a record in hubspot"
- ❌ "add to hubspot"
- ❌ "sync to hubspot"

**Result**: Prompt "create a record in hubspot" → Only matches "hubspot" → May not detect correctly

---

## 🔍 Step 2: Universal Node Detection

**Location**: `worker/src/services/ai/summarize-layer.ts` lines 3827-3922

### ✅ UNIVERSAL: 6 Detection Methods

```typescript
private universalNodeDetection(userPrompt: string, allKeywordData: AliasKeyword[]): Map<string, DetectionResult> {
  // For EACH node in registry:
  for (const nodeType of allNodeTypes) {
    // METHOD 1: Direct node type name matching
    const typeMatch = this.detectByNodeTypeName(nodeType, promptWords);
    
    // METHOD 2: Registry label matching
    const labelMatch = this.detectByRegistryLabel(nodeDef, promptLower);
    
    // METHOD 3: Registry tags/aliases matching
    const tagsMatch = this.detectByRegistryTags(nodeDef, promptLower);
    
    // METHOD 4: Keyword matching (uses AliasKeywordCollector) ✅
    const keywordMatch = this.detectByKeywords(nodeType, allKeywordData, promptLower);
    
    // METHOD 5: Semantic word matching
    const semanticMatch = this.detectBySemanticWords(nodeType, nodeDef, promptWords);
    
    // METHOD 6: Fuzzy matching (typos)
    const fuzzyMatch = this.detectByFuzzyMatching(nodeType, promptWords);
    
    // Merge all results (take highest confidence)
    const bestMatch = this.mergeDetectionResults([typeMatch, labelMatch, tagsMatch, keywordMatch, semanticMatch, fuzzyMatch]);
    
    // Filter by confidence threshold (0.7)
    if (bestMatch && bestMatch.confidence >= 0.7) {
      allDetections.set(nodeType, bestMatch);
    }
  }
}
```

### ✅ UNIVERSAL: Uses Registry

- Gets all node types from `unifiedNodeRegistry.getAllTypes()`
- No hardcoded node lists
- **Works for infinite workflows** ✅

### ❌ ISSUE: Keyword Matching May Fail

**Keyword Detection** (line 3653):
```typescript
private detectByKeywords(nodeType: string, allKeywords: AliasKeyword[], promptLower: string): DetectionResult | null {
  const nodeKeywords = allKeywords.filter(k => k.nodeType === nodeType);
  
  for (const keywordData of nodeKeywords) {
    // Exact keyword match
    if (promptLower.includes(keywordLower)) {
      return { confidence: 0.9, method: 'keyword', match: keywordLower };
    }
  }
}
```

**Problem**: Uses simple `includes()` check - may match partial words incorrectly

**Example**:
- Prompt: "create a record in hubspot"
- Keywords: ['hubspot', 'hub spot']
- Match: ✅ "hubspot" found
- But: May not have high enough confidence if other methods fail

---

## 🎯 Step 3: Intent Classification

**Location**: `worker/src/services/ai/summarize-layer.ts` lines 4141-4200

### ✅ EXPLICIT vs CATEGORY Classification

```typescript
private classifyIntentType(match: string, nodeType: string, promptLower: string): 'EXPLICIT' | 'CATEGORY' {
  // EXPLICIT: User explicitly mentioned the node name
  // CATEGORY: User mentioned a general category term
  
  // Check if node type name appears in prompt
  const nodeTypeWords = nodeType.toLowerCase().split(/[_\s-]+/);
  const allWordsInPrompt = nodeTypeWords.every(word => promptLower.includes(word));
  
  if (allWordsInPrompt) {
    return 'EXPLICIT'; // ✅ User explicitly mentioned this node
  }
  
  return 'CATEGORY'; // User mentioned a general term
}
```

### ❌ ISSUE: May Not Recognize Multi-Word Names

**Example**:
- Prompt: "create a record in hubspot"
- Node: "hubspot"
- Check: `promptLower.includes('hubspot')` → ✅ TRUE
- Result: Should be EXPLICIT ✅

**But for "zoho_crm"**:
- Prompt: "create in zoho crm"
- Node: "zoho_crm"
- Check: `promptLower.includes('zoho_crm')` → ❌ FALSE (prompt has "zoho crm" with space)
- Result: May be classified as CATEGORY ❌

---

## 📦 Step 4: Semantic Grouping

**Location**: `worker/src/services/ai/summarize-layer.ts` lines 3997-4056

### ⚠️ PARTIALLY HARDCODED: CRM Grouping

```typescript
private groupNodesBySemanticCategory(nodeTypes: string[]): Map<string, string[]> {
  // ✅ UNIVERSAL: Uses registry category
  const category = nodeDef.category || 'utility';
  const tags = (nodeDef.tags || []).map(t => t.toLowerCase());
  
  // ❌ HARDCODED: CRM grouping checks specific node type names
  if (tags.includes('crm') || (category === 'data' && (
    nodeType.includes('crm') || 
    nodeType.includes('salesforce') ||  // ❌ HARDCODED
    nodeType.includes('hubspot') ||    // ❌ HARDCODED
    nodeType.includes('zoho') ||       // ❌ HARDCODED
    nodeType.includes('pipedrive') ||   // ❌ HARDCODED
    ...
  ))) {
    semanticGroupKey = 'crm_group';
  }
}
```

### ❌ ISSUE: Hardcoded Node Type Checks

**Problem**: Line 4013 has hardcoded checks for specific CRM node types
- `nodeType.includes('salesforce')`
- `nodeType.includes('hubspot')`
- `nodeType.includes('zoho')`
- `nodeType.includes('pipedrive')`

**Should Use**: Registry capabilities instead
```typescript
// ✅ CORRECT (universal):
const capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
if (capabilities.includes('crm') || capabilities.includes('write_crm')) {
  semanticGroupKey = 'crm_group';
}
```

---

## 🎯 Step 5: Node Selection (Intent Preservation)

**Location**: `worker/src/services/ai/summarize-layer.ts` lines 4076-4150

### ✅ UNIVERSAL: Intent Preservation Logic

```typescript
private selectOneNodePerCategoryWithIntentPreservation(
  groupedByCategory: Map<string, string[]>,
  extractedKeywords: Map<string, { confidence: number; match: string; intentType: 'EXPLICIT' | 'CATEGORY' }>
): string[] {
  for (const [category, nodeTypes] of groupedByCategory.entries()) {
    // ✅ PRIORITY 1: Check for EXPLICIT mentions
    const explicitNodes = nodeTypes.filter(nodeType => {
      const keywordInfo = extractedKeywords.get(nodeType);
      return keywordInfo && keywordInfo.intentType === 'EXPLICIT';
    });
    
    if (explicitNodes.length > 0) {
      // User explicitly mentioned a node → use it (preserve user intent)
      selected.push(explicitNodes[0]);
      continue;
    }
    
    // ✅ PRIORITY 2: If no EXPLICIT, pick highest confidence
    const bestNode = nodeTypes.reduce((best, current) => {
      const currentInfo = extractedKeywords.get(current);
      const bestInfo = extractedKeywords.get(best);
      return (currentInfo?.confidence || 0) > (bestInfo?.confidence || 0) ? current : best;
    });
    
    selected.push(bestNode);
  }
}
```

### ✅ GOOD: Prioritizes EXPLICIT Mentions

- If user explicitly mentions "hubspot" → Always selects hubspot
- If user says "crm" (generic) → Selects best CRM (highest confidence)

### ❌ ISSUE: If Intent Classification Fails

**Problem**: If "create a record in hubspot" is classified as CATEGORY instead of EXPLICIT:
- Multiple CRMs detected: ['hubspot', 'salesforce']
- Both classified as CATEGORY
- Selects highest confidence → May pick salesforce instead of hubspot ❌

---

## 🔄 Step 6: Keyword to Node Type Mapping

**Location**: `worker/src/services/ai/summarize-layer.ts` lines 4538-4597

### ✅ UNIVERSAL: Maps Keywords to Node Types

```typescript
private mapKeywordsToNodeTypes(keywords: string[], originalPrompt?: string): string[] {
  const allAliasKeywords = this.keywordCollector.getAllAliasKeywords();
  
  for (const keyword of keywords) {
    // Direct match (keyword is already a node type)
    if (nodeLibrary.isNodeTypeRegistered(keyword)) {
      nodeTypes.add(keyword);
      continue;
    }
    
    // Alias match (keyword maps to node type via keyword collector)
    const keywordData = allAliasKeywords.find(
      kd => kd.keyword.toLowerCase() === keyword.toLowerCase()
    );
    
    if (keywordData) {
      nodeTypes.add(keywordData.nodeType);
    }
  }
}
```

### ✅ GOOD: Uses AliasKeywordCollector

- No hardcoded mappings
- Uses collected keywords from schemas
- **Works for infinite workflows** ✅

---

## 📋 Summary: Is It Universal or Hardcoded?

### ✅ UNIVERSAL (Works for All Nodes):

1. **Keyword Collection** (`AliasKeywordCollector`)
   - ✅ Collects from ALL node schemas dynamically
   - ✅ No hardcoded node lists
   - ✅ Works for infinite workflows

2. **Universal Node Detection** (`universalNodeDetection`)
   - ✅ Scans ALL nodes from registry
   - ✅ Uses 6 detection methods
   - ✅ No hardcoded node checks

3. **Intent Preservation** (`selectOneNodePerCategoryWithIntentPreservation`)
   - ✅ Prioritizes EXPLICIT mentions
   - ✅ Uses registry categories
   - ✅ No hardcoded priority lists

4. **Keyword Mapping** (`mapKeywordsToNodeTypes`)
   - ✅ Uses AliasKeywordCollector
   - ✅ No hardcoded mappings

### ❌ HARDCODED (Causes Issues):

1. **Semantic Grouping** (line 4013)
   - ❌ Hardcoded checks: `nodeType.includes('salesforce')`, `nodeType.includes('hubspot')`
   - ❌ Should use registry capabilities instead

2. **HubSpot Keywords** (line 5201, 5210)
   - ❌ Only `['hubspot', 'hub spot']` - missing variations
   - ❌ Should include: "create in hubspot", "hubspot record", etc.

3. **Intent Classification** (line 4141)
   - ⚠️ May not recognize multi-word names correctly
   - ⚠️ "zoho crm" vs "zoho_crm" may fail

---

## 🐛 Why HubSpot/Gmail Detection Fails

### Issue 1: Limited Keywords

**HubSpot Schema** (line 5201):
```typescript
keywords: ['hubspot', 'hub spot'], // ❌ TOO LIMITED
```

**Missing**:
- "create in hubspot"
- "hubspot record"
- "create a record in hubspot"
- "add to hubspot"

**Fix**: Add more keywords to schema:
```typescript
keywords: [
  'hubspot', 
  'hub spot',
  'create in hubspot',      // ✅ ADD
  'hubspot record',         // ✅ ADD
  'create a record in hubspot', // ✅ ADD
  'add to hubspot',         // ✅ ADD
  'sync to hubspot',        // ✅ ADD
],
```

### Issue 2: Hardcoded Semantic Grouping

**Line 4013**:
```typescript
if (tags.includes('crm') || (category === 'data' && (
  nodeType.includes('salesforce') ||  // ❌ HARDCODED
  nodeType.includes('hubspot') ||    // ❌ HARDCODED
  ...
))) {
  semanticGroupKey = 'crm_group';
}
```

**Problem**: Groups all CRMs together → Only one selected → May lose user's explicit choice

**Fix**: Use registry capabilities:
```typescript
const capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
if (capabilities.includes('crm') || capabilities.includes('write_crm')) {
  semanticGroupKey = 'crm_group';
}
```

### Issue 3: Intent Classification

**Line 4141**: May not recognize "create a record in hubspot" as EXPLICIT

**Fix**: Improve multi-word name detection:
```typescript
// Check if ALL words of node type appear in prompt (in order)
const nodeTypeWords = nodeType.toLowerCase().split(/[_\s-]+/);
const promptWords = promptLower.split(/\s+/);
const allWordsFound = nodeTypeWords.every(word => 
  promptWords.some(pw => pw.includes(word) || word.includes(pw))
);
if (allWordsFound) return 'EXPLICIT';
```

---

## ✅ Recommended Fixes

### Fix 1: Enhance HubSpot Keywords (Priority 1)

**File**: `worker/src/services/nodes/node-library.ts` line 5201

```typescript
keywords: [
  'hubspot', 
  'hub spot',
  'create in hubspot',
  'hubspot record',
  'create a record in hubspot',
  'add to hubspot',
  'sync to hubspot',
  'hubspot contact',
  'hubspot deal',
],
```

### Fix 2: Remove Hardcoded Semantic Grouping (Priority 2)

**File**: `worker/src/services/ai/summarize-layer.ts` line 4013

Replace hardcoded checks with registry capabilities:
```typescript
// ✅ UNIVERSAL: Use registry capabilities
const capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
if (capabilities.some(cap => cap.includes('crm'))) {
  semanticGroupKey = 'crm_group';
}
```

### Fix 3: Improve Intent Classification (Priority 3)

**File**: `worker/src/services/ai/summarize-layer.ts` line 4141

Improve multi-word name detection:
```typescript
// Check if ALL words of node type appear in prompt
const nodeTypeWords = nodeType.toLowerCase().split(/[_\s-]+/);
const promptWords = promptLower.split(/\s+/);
const allWordsFound = nodeTypeWords.every(word => 
  promptWords.some(pw => pw.includes(word) || word.includes(pw))
);
```

---

## 📊 Current Status

### ✅ Working (Universal):
- Keyword collection from schemas
- Universal node detection (6 methods)
- Intent preservation logic
- Keyword to node type mapping

### ❌ Broken (Hardcoded/Limited):
- HubSpot keywords too limited
- Semantic grouping has hardcoded checks
- Intent classification may fail for multi-word names

### 🎯 Expected After Fixes:
- "create a record in hubspot" → Detects `hubspot` correctly
- "send email via gmail" → Detects `google_gmail` correctly
- All nodes work universally (no hardcoding)

---

## 🔍 How to Verify

1. **Check HubSpot Keywords**:
   ```typescript
   const schema = nodeLibrary.getSchema('hubspot');
   console.log(schema.keywords); // Should include "create in hubspot"
   ```

2. **Check Detection**:
   ```typescript
   const allKeywords = keywordCollector.getAllAliasKeywords();
   const hubspotKeywords = allKeywords.filter(k => k.nodeType === 'hubspot');
   console.log(hubspotKeywords); // Should show all keywords
   ```

3. **Test Detection**:
   ```typescript
   const prompt = "create a record in hubspot";
   const detected = extractKeywordsFromPrompt(prompt, allKeywords);
   console.log(detected); // Should include 'hubspot'
   ```

---

## 📝 Conclusion

**The system IS mostly universal**, but has **3 critical issues**:

1. **Limited keywords** in node schemas (HubSpot only has 2 keywords)
2. **Hardcoded semantic grouping** (line 4013)
3. **Intent classification** may fail for multi-word names

**Fix these 3 issues** → System will work perfectly for ALL nodes ✅
