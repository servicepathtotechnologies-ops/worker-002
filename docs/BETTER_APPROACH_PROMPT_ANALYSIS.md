# Better Approach: Perfect Prompt Analysis with Intent and Matched Nodes

## Current Problems Summary

1. **Keywords extracted AFTER variations generated** → Variations don't include keywords
2. **LLM ignores keywords** → Variations generated without extracted keywords
3. **Selected variation's matchedKeywords ignored** → System re-detects nodes instead of using variation's nodes
4. **Inconsistent node detection** → Same prompt gives different results

## Better Approach: 3-Phase Analysis Pipeline

### Phase 1: Pre-Analysis - Extract Keywords FIRST

**Goal:** Extract ALL keywords from user prompt BEFORE generating variations

**Flow:**
```
User Prompt → Extract Keywords → Map to Node Types → Validate Against Library → Store as Base Keywords
```

**Implementation:**
1. **Extract keywords from user prompt** using `AliasKeywordCollector`
2. **Map keywords to node types** using `mapKeywordsToNodeTypes()`
3. **Validate node types** against `nodeLibrary.isNodeTypeRegistered()`
4. **Store as base keywords** for variation generation

**Benefits:**
- Keywords extracted BEFORE variations
- All mentioned nodes are found (Instagram, Twitter, LinkedIn, etc.)
- Node types validated against library
- Consistent extraction (not dependent on LLM)

### Phase 2: Variation Generation - Use Extracted Keywords

**Goal:** Generate variations that MUST include extracted keywords

**Flow:**
```
Base Keywords → Build Prompt with Keywords → LLM Generates Variations → Validate Variations Include Keywords
```

**Implementation:**
1. **Build system prompt** with extracted keywords as REQUIRED nodes
2. **Enforce keyword usage** in system prompt (not just suggest)
3. **Generate variations** with LLM
4. **Validate variations** include all extracted keywords
5. **Regenerate if keywords missing** (retry with stronger enforcement)

**System Prompt Enhancement:**
```
🚨 CRITICAL: You MUST include these REQUIRED nodes in ALL variations:
${extractedNodeTypes.join(', ')}

Each variation MUST mention these nodes explicitly.
If user says "instagram", you MUST include "instagram" node in variations.
DO NOT replace with other nodes (e.g., don't use "google_gmail" if user said "instagram").
```

**Benefits:**
- Variations MUST include extracted keywords
- No missing nodes (Instagram, Twitter, etc.)
- Consistent variations (all include required nodes)
- Validation ensures keywords are present

### Phase 3: Variation Selection - Extract Nodes from Selected Variation

**Goal:** When user selects a variation, extract nodes from that variation's matchedKeywords

**Flow:**
```
User Selects Variation → Extract matchedKeywords from Variation → Map to Node Types → Validate → Use in Workflow
```

**Implementation:**
1. **Store full variation object** (not just prompt text) when user selects
2. **Extract matchedKeywords** from selected variation
3. **Map keywords to node types** using `mapKeywordsToNodeTypes()`
4. **Validate nodes** against node library
5. **Use as mandatoryNodeTypes** for workflow generation

**API Changes:**
```typescript
// Frontend sends:
{
  selectedPromptVariation: "prompt text...",
  selectedVariationId: "variation-1", // ✅ NEW: Variation ID
  selectedVariationMatchedKeywords: ["manual_trigger", "ai_chat_model", "instagram"] // ✅ NEW: Keywords
}

// Backend extracts:
const nodesFromVariation = extractNodesFromVariation(
  selectedVariationId,
  selectedVariationMatchedKeywords,
  allVariations
);
```

**Benefits:**
- Nodes extracted from selected variation (not re-detected)
- Uses AI's node detection (from variation)
- Consistent with what user selected
- No re-detection errors

## Complete Flow Architecture

### Step 1: User Prompt Analysis

```
User Prompt: "Generate AI content daily and post automatically on instagram"

Phase 1: Pre-Analysis
├─ Extract Keywords: ["daily", "content", "ai", "post", "automatically", "instagram"]
├─ Map to Node Types: ["schedule", "ai_chat_model", "instagram"]
├─ Validate: All 3 nodes exist in library ✅
└─ Store: baseKeywords = ["schedule", "ai_chat_model", "instagram"]
```

### Step 2: Variation Generation with Keywords

```
Phase 2: Generate Variations
├─ System Prompt: "MUST include: schedule, ai_chat_model, instagram"
├─ LLM Generates 4 Variations
│  ├─ Variation 1: "Use schedule trigger... ai_chat_model... instagram node..." ✅
│  ├─ Variation 2: "Use schedule trigger... ai_chat_model... instagram node..." ✅
│  ├─ Variation 3: "Use schedule trigger... ai_chat_model... instagram node..." ✅
│  └─ Variation 4: "Use webhook trigger... ai_chat_model... instagram node..." ✅
├─ Validate: All variations include instagram ✅
└─ Return: Variations with matchedKeywords
```

### Step 3: User Selection

```
User Selects: Variation 1

Phase 3: Extract Nodes from Selection
├─ Get Variation 1: { prompt: "...", matchedKeywords: ["schedule", "ai_chat_model", "instagram"] }
├─ Map Keywords: ["schedule", "ai_chat_model", "instagram"]
├─ Validate: All 3 nodes exist in library ✅
└─ Use: mandatoryNodeTypes = ["schedule", "ai_chat_model", "instagram"]
```

### Step 4: Workflow Generation

```
Workflow Generation
├─ Receive: selectedStructuredPrompt + mandatoryNodeTypes
├─ Planner: MUST include mandatoryNodeTypes
├─ Builder: Uses mandatoryNodeTypes
└─ Result: Workflow with schedule, ai_chat_model, instagram ✅
```

## Implementation Strategy

### Strategy 1: Extract Keywords FIRST (Before Variations)

**Location:** `summarize-layer.ts` - `clarifyIntentAndGenerateVariations()`

**Change:**
```typescript
async clarifyIntentAndGenerateVariations(userPrompt: string) {
  // ✅ STEP 1: Extract keywords FIRST (before generating variations)
  const allKeywordData = this.keywordCollector.getAllAliasKeywords();
  const extractedKeywords = this.extractKeywordsFromPrompt(userPrompt, allKeywordData);
  const extractedNodeTypes = this.mapKeywordsToNodeTypes(extractedKeywords);
  
  console.log(`[AIIntentClarifier] ✅ Pre-extracted ${extractedNodeTypes.length} node type(s): ${extractedNodeTypes.join(', ')}`);
  
  // ✅ STEP 2: Build prompt with REQUIRED nodes (enforced, not suggested)
  const aiPrompt = this.buildClarificationPrompt(userPrompt, allKeywords, extractedNodeTypes);
  
  // ✅ STEP 3: Generate variations (LLM must include extractedNodeTypes)
  const aiResponse = await ollamaOrchestrator.processRequest(...);
  
  // ✅ STEP 4: Validate variations include extractedNodeTypes
  const result = this.parseAIResponse(aiResponse, userPrompt, allKeywordData);
  this.validateVariationsIncludeNodes(result, extractedNodeTypes);
  
  return result;
}
```

### Strategy 2: Enforce Keywords in System Prompt

**Location:** `summarize-layer.ts` - `getSystemPrompt()`

**Change:**
```typescript
private getSystemPrompt(extractedNodeTypes: string[]): string {
  const requiredNodesSection = extractedNodeTypes.length > 0
    ? `
🚨 CRITICAL - REQUIRED NODES (MUST include in ALL variations):
${extractedNodeTypes.map((node, idx) => `  ${idx + 1}. ${node}`).join('\n')}

RULES FOR REQUIRED NODES:
- You MUST mention each required node explicitly in each variation
- If user says "instagram", you MUST include "instagram" node (not "google_gmail")
- DO NOT replace required nodes with other nodes
- DO NOT omit required nodes from variations
- Each variation MUST include ALL required nodes
`
    : '';

  return `You are a workflow automation expert...
${requiredNodesSection}
...`;
}
```

### Strategy 3: Extract Nodes from Selected Variation

**Location:** `generate-workflow.ts` - `handlePhasedRefine()`

**Change:**
```typescript
// When user selects variation
const selectedPromptVariation = (req.body as any).selectedPromptVariation;
const selectedVariationId = (req.body as any).selectedVariationId; // ✅ NEW
const selectedVariationMatchedKeywords = (req.body as any).selectedVariationMatchedKeywords; // ✅ NEW

if (selectedPromptVariation && selectedVariationMatchedKeywords) {
  // ✅ Extract nodes from selected variation's matchedKeywords
  const nodesFromVariation = extractNodesFromVariationKeywords(
    selectedVariationMatchedKeywords,
    allKeywordData
  );
  
  // ✅ Use as mandatoryNodeTypes
  (req as any).mandatoryNodeTypes = nodesFromVariation;
  
  console.log(`[PhasedRefine] ✅ Extracted ${nodesFromVariation.length} node(s) from selected variation: ${nodesFromVariation.join(', ')}`);
}
```

### Strategy 4: Validate Variations Include Keywords

**Location:** `summarize-layer.ts` - New method

**Change:**
```typescript
private validateVariationsIncludeNodes(
  result: SummarizeLayerResult,
  requiredNodeTypes: string[]
): void {
  if (requiredNodeTypes.length === 0) return;
  
  for (const variation of result.promptVariations) {
    const variationLower = variation.prompt.toLowerCase();
    const missingNodes: string[] = [];
    
    for (const nodeType of requiredNodeTypes) {
      const nodeLower = nodeType.toLowerCase();
      // Check if node type is mentioned in variation
      if (!variationLower.includes(nodeLower) && 
          !variation.matchedKeywords.some(k => k.toLowerCase() === nodeLower)) {
        missingNodes.push(nodeType);
      }
    }
    
    if (missingNodes.length > 0) {
      console.warn(`[AIIntentClarifier] ⚠️  Variation missing required nodes: ${missingNodes.join(', ')}`);
      // Optionally: Regenerate or enhance variation
    }
  }
}
```

## Benefits of Better Approach

### 1. Consistency
- ✅ Keywords extracted FIRST (always consistent)
- ✅ Variations MUST include keywords (no missing nodes)
- ✅ Nodes from selected variation (no re-detection errors)

### 2. Accuracy
- ✅ All mentioned nodes found (Instagram, Twitter, LinkedIn)
- ✅ Nodes validated against library
- ✅ Uses AI's node detection (from variation)

### 3. Reliability
- ✅ No LLM interpretation errors (keywords enforced)
- ✅ No missing nodes (validation ensures presence)
- ✅ No re-detection errors (uses variation's nodes)

### 4. User Experience
- ✅ Variations show correct nodes
- ✅ Selected variation has expected nodes
- ✅ Workflow includes all mentioned nodes

## Comparison: Current vs Better Approach

### Current Approach (Broken)
```
User Prompt → LLM Generates Variations (guesses) → Extract Keywords (too late) → User Selects → Re-detect Nodes (might miss)
```

**Problems:**
- Keywords extracted too late
- LLM ignores keywords
- Re-detection might miss nodes
- Inconsistent results

### Better Approach (Fixed)
```
User Prompt → Extract Keywords FIRST → Generate Variations WITH Keywords → User Selects → Extract Nodes FROM Variation
```

**Benefits:**
- Keywords extracted first
- Keywords enforced in variations
- Nodes from selected variation
- Consistent results

## Implementation Priority

### Priority 1: Extract Keywords FIRST
- Move keyword extraction before variation generation
- Store extracted keywords
- Use as base for variation generation

### Priority 2: Enforce Keywords in Variations
- Update system prompt to REQUIRE keywords
- Validate variations include keywords
- Regenerate if keywords missing

### Priority 3: Extract Nodes from Selected Variation
- Pass variation ID/keywords when user selects
- Extract nodes from variation's matchedKeywords
- Use as mandatoryNodeTypes

### Priority 4: Validation Layer
- Validate variations include required nodes
- Validate nodes against library
- Ensure consistency throughout pipeline

## Summary

**The Better Approach:**
1. **Extract keywords FIRST** (before variations)
2. **Enforce keywords in variations** (not just suggest)
3. **Extract nodes from selected variation** (not re-detect)
4. **Validate at each step** (ensure consistency)

**Result:**
- ✅ Perfect prompt analysis
- ✅ Accurate intent detection
- ✅ All nodes matched correctly
- ✅ Consistent workflow generation
