# Keyword Extraction to Workflow Generation - Complete Flow & Better Approach

## 📋 Current Flow Analysis

### Phase 1: Keyword Extraction (Summarize Layer)

**Location**: `worker/src/services/ai/summarize-layer.ts`

**Current Behavior**:
1. **AI-Generated Keywords**: AI generates `matchedKeywords` based on what it thinks is relevant
   - Example: `["manual_trigger", "ai_chat_model", "webhook"]`
   - ❌ **Problem**: AI misses explicitly mentioned platforms (Twitter, LinkedIn, Facebook)

2. **No Post-Processing Extraction**: System doesn't scan original prompt for missed keywords
   - ❌ **Problem**: Keywords like "twitter", "linkedin", "facebook" are mentioned but not extracted

3. **Keywords Shown in UI**: `matchedKeywords` are displayed below prompt variations
   - ✅ **Working**: User sees some keywords
   - ❌ **Problem**: Not all mentioned keywords are shown

### Phase 2: Prompt Selection

**Location**: `worker/src/api/generate-workflow.ts` (lines 389-427)

**Current Behavior**:
1. User selects a prompt variation
2. Selected variation becomes `finalPrompt`
3. **Keywords are NOT passed to planner** - only the prompt text is used

### Phase 3: Workflow Planning

**Location**: `worker/src/services/workflow-planner.ts`

**Current Behavior**:
1. Planner receives only the `userPrompt` (selected variation)
2. Planner uses AI to generate workflow plan
3. **Keywords are NOT used** - planner relies on AI interpretation of prompt text
4. Planner may miss nodes that were extracted as keywords

### Phase 4: Workflow Generation

**Location**: `worker/src/services/ai/workflow-builder.ts`

**Current Behavior**:
1. Workflow builder receives plan from planner
2. Nodes are selected based on plan steps
3. **Keywords are NOT enforced** - nodes may not match extracted keywords

---

## 🔍 The Gap: Keywords → Workflow Disconnection

### Current Problem

```
User Prompt: "Generate AI content daily and post automatically on all social platforms including Twitter, LinkedIn, and Facebook"

Extracted Keywords: ["manual_trigger", "ai_chat_model", "webhook"]
Missing Keywords: ["twitter", "linkedin", "facebook"]

↓

Planner receives: Selected prompt variation (text only)
Planner doesn't know: Which keywords were extracted

↓

Workflow Generated: May include generic nodes, missing Twitter/LinkedIn/Facebook nodes
```

### Why This Happens

1. **Keywords are extracted but not enforced**
   - Keywords are shown in UI for user visibility
   - But they're not passed to planner as constraints

2. **Planner relies on AI interpretation**
   - Planner reads prompt text and infers nodes
   - AI may not catch all mentioned platforms

3. **No keyword-to-node mapping enforcement**
   - System doesn't enforce: "If 'twitter' keyword exists → must include 'twitter' node"

---

## ✅ Better Approach: Keyword-Driven Workflow Generation

### Approach 1: **Mandatory Keywords** (Recommended)

**Concept**: Extracted keywords become **mandatory node requirements**

**Flow**:
```
1. Extract ALL keywords from original prompt
   - AI-generated keywords: ["manual_trigger", "ai_chat_model", "webhook"]
   - Post-processed keywords: ["twitter", "linkedin", "facebook"]
   - Combined: ["manual_trigger", "ai_chat_model", "webhook", "twitter", "linkedin", "facebook"]

2. Map keywords to node types
   - "twitter" → "twitter" node
   - "linkedin" → "linkedin" node
   - "facebook" → "facebook" node

3. Pass mandatory nodes to planner
   - Planner MUST include these nodes in workflow
   - Planner can add additional nodes if needed

4. Generate workflow with mandatory nodes
   - Workflow builder ensures mandatory nodes are included
   - Nodes are arranged in logical order
   - Edges connect nodes properly
```

**Implementation**:
- ✅ **Extract keywords from original prompt** (post-processing step)
- ✅ **Map keywords to node types** (using node registry)
- ✅ **Pass mandatory nodes to planner** (as constraints)
- ✅ **Enforce mandatory nodes in workflow generation** (validation step)

### Approach 2: **Guided Keywords** (Alternative)

**Concept**: Extracted keywords are **suggestions**, not requirements

**Flow**:
```
1. Extract keywords (same as Approach 1)

2. Pass keywords as hints to planner
   - Planner considers keywords but can override
   - Planner may add nodes not in keywords

3. Planner uses keywords to guide node selection
   - Higher priority for keyword-matched nodes
   - But can select alternatives if better fit
```

**Trade-off**:
- ✅ More flexible (planner can optimize)
- ❌ May miss explicitly mentioned platforms

---

## 🎯 Recommended Implementation Strategy

### Step 1: Enhanced Keyword Extraction

**Location**: `worker/src/services/ai/summarize-layer.ts`

**Add Post-Processing**:
```typescript
private extractKeywordsFromPrompt(userPrompt: string, allKeywordData: AliasKeyword[]): string[] {
  const extractedKeywords = new Set<string>();
  const promptLower = userPrompt.toLowerCase();
  
  // Step 1: Get AI-generated keywords (existing)
  const aiKeywords = this.parseAIResponse(aiResponse, userPrompt, allKeywordData).matchedKeywords;
  aiKeywords.forEach(k => extractedKeywords.add(k.toLowerCase()));
  
  // Step 2: Post-process original prompt for missed keywords
  for (const keywordData of allKeywordData) {
    const keywordLower = keywordData.keyword.toLowerCase();
    
    // Check if keyword is mentioned in prompt
    if (promptLower.includes(keywordLower)) {
      extractedKeywords.add(keywordData.nodeType);
    }
    
    // Check aliases
    for (const alias of keywordData.aliases || []) {
      if (promptLower.includes(alias.toLowerCase())) {
        extractedKeywords.add(keywordData.nodeType);
      }
    }
  }
  
  return Array.from(extractedKeywords);
}
```

### Step 2: Keyword-to-Node Mapping

**Location**: `worker/src/services/ai/summarize-layer.ts`

**Map Keywords to Node Types**:
```typescript
private mapKeywordsToNodeTypes(keywords: string[]): string[] {
  const nodeTypes = new Set<string>();
  
  for (const keyword of keywords) {
    // Direct match (keyword is node type)
    if (nodeLibrary.isNodeTypeRegistered(keyword)) {
      nodeTypes.add(keyword);
      continue;
    }
    
    // Alias match (keyword maps to node type)
    const keywordData = this.keywordCollector.getNodeTypeForKeyword(keyword);
    if (keywordData) {
      nodeTypes.add(keywordData.nodeType);
    }
  }
  
  return Array.from(nodeTypes);
}
```

### Step 3: Pass Keywords to Planner

**Location**: `worker/src/api/generate-workflow.ts`

**Modify Planner Call**:
```typescript
// After user selects prompt variation
const summarizeResult = await summarizeLayerService.processPrompt(originalPrompt);

// Extract mandatory node types from keywords
const mandatoryNodeTypes = summarizeResult.matchedKeywords
  .map(keyword => mapKeywordToNodeType(keyword))
  .filter(Boolean); // Remove nulls

// Pass to planner
const workflowPlan = await workflowPlanner.planWorkflow(
  selectedPromptVariation,
  {
    mandatoryNodes: mandatoryNodeTypes, // NEW: Enforce these nodes
    suggestedNodes: [], // Optional: Additional suggestions
  }
);
```

### Step 4: Enforce Mandatory Nodes in Planner

**Location**: `worker/src/services/workflow-planner.ts`

**Add Mandatory Node Enforcement**:
```typescript
async planWorkflow(
  userPrompt: string,
  constraints?: { mandatoryNodes?: string[]; suggestedNodes?: string[] }
): Promise<WorkflowPlan> {
  
  // Generate plan from AI
  let plan = await this.executePlanning(userPrompt);
  
  // Step 1: Ensure mandatory nodes are included
  if (constraints?.mandatoryNodes) {
    for (const mandatoryNode of constraints.mandatoryNodes) {
      const isIncluded = plan.steps.some(step => 
        step.nodeType === mandatoryNode || 
        step.type === mandatoryNode
      );
      
      if (!isIncluded) {
        // Add mandatory node to plan
        plan.steps.push({
          id: `mandatory_${mandatoryNode}`,
          nodeType: mandatoryNode,
          description: `Required node: ${mandatoryNode}`,
          order: plan.steps.length + 1,
        });
      }
    }
  }
  
  // Step 2: Reorder steps logically
  plan = this.reorderSteps(plan);
  
  return plan;
}
```

### Step 5: Validate Workflow Contains Mandatory Nodes

**Location**: `worker/src/services/ai/workflow-builder.ts`

**Add Validation**:
```typescript
private validateWorkflowContainsNodes(
  workflow: Workflow,
  mandatoryNodes: string[]
): { valid: boolean; missing: string[] } {
  const workflowNodeTypes = workflow.nodes.map(n => n.type || n.data?.type);
  const missing = mandatoryNodes.filter(
    mandatory => !workflowNodeTypes.includes(mandatory)
  );
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
```

---

## 🎨 UI/UX Considerations

### Option A: Show Keywords as "Required Nodes" (Recommended)

**UI Display**:
```
┌─────────────────────────────────────────┐
│ Original Prompt:                        │
│ "Generate AI content and post to       │
│  Twitter, LinkedIn, and Facebook"      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Detected Keywords:                      │
│ [manual_trigger] [ai_chat_model]        │
│ [twitter] [linkedin] [facebook]         │
│                                         │
│ ✅ These nodes will be included in      │
│    the generated workflow              │
└─────────────────────────────────────────┘
```

**Benefits**:
- ✅ User sees what will be included
- ✅ Sets clear expectations
- ✅ Transparent about mandatory nodes

### Option B: Show Keywords as "Detected Platforms"

**UI Display**:
```
┌─────────────────────────────────────────┐
│ Detected Platforms:                     │
│ 🐦 Twitter                              │
│ 💼 LinkedIn                             │
│ 📘 Facebook                             │
│                                         │
│ These platforms will be included in    │
│ the workflow generation.               │
└─────────────────────────────────────────┘
```

**Benefits**:
- ✅ More user-friendly (shows platform names, not node types)
- ✅ Clearer for non-technical users

---

## 📊 Node Arrangement & Edge Connection

### How Nodes Are Arranged

**Current Flow**:
```
1. Planner generates ordered steps
2. Workflow builder creates nodes in order
3. Edges connect sequentially: step[i] → step[i+1]
```

**With Mandatory Nodes**:
```
1. Planner generates ordered steps
2. Mandatory nodes are inserted at appropriate positions
3. Edges connect:
   - Trigger → First step
   - Step[i] → Step[i+1]
   - Last step → Output nodes (if multiple, use parallel or merge)
```

### Example: Social Media Posting Workflow

**User Prompt**: "Generate AI content and post to Twitter, LinkedIn, Facebook"

**Mandatory Nodes**: `["twitter", "linkedin", "facebook"]`

**Generated Workflow**:
```
manual_trigger
  ↓
ai_chat_model (generate content)
  ↓
┌─→ twitter (post to Twitter)
├─→ linkedin (post to LinkedIn)
└─→ facebook (post to Facebook)
```

**Edge Structure**:
```json
{
  "edges": [
    { "source": "trigger_1", "target": "ai_chat_1", "type": "main" },
    { "source": "ai_chat_1", "target": "twitter_1", "type": "main" },
    { "source": "ai_chat_1", "target": "linkedin_1", "type": "main" },
    { "source": "ai_chat_1", "target": "facebook_1", "type": "main" }
  ]
}
```

---

## ✅ Implementation Checklist

### Phase 1: Enhanced Keyword Extraction
- [ ] Add post-processing to extract keywords from original prompt
- [ ] Map keywords to node types using registry
- [ ] Combine AI-generated + extracted keywords
- [ ] Return complete keyword list in `SummarizeLayerResult`

### Phase 2: Pass Keywords to Planner
- [ ] Modify `generate-workflow.ts` to extract mandatory nodes
- [ ] Pass mandatory nodes to `workflowPlanner.planWorkflow()`
- [ ] Update planner interface to accept constraints

### Phase 3: Enforce Mandatory Nodes
- [ ] Add mandatory node enforcement in planner
- [ ] Insert mandatory nodes into plan if missing
- [ ] Reorder steps to maintain logical flow

### Phase 4: Validate Workflow
- [ ] Add validation to ensure mandatory nodes are in workflow
- [ ] Return error if mandatory nodes are missing
- [ ] Log warnings for missing nodes

### Phase 5: UI Updates
- [ ] Display extracted keywords in UI
- [ ] Show which nodes will be mandatory
- [ ] Update UI to show keyword-to-node mapping

---

## 🎯 Summary: Recommended Approach

**Best Approach**: **Mandatory Keywords** (Approach 1)

**Why**:
1. ✅ **User Intent Preservation**: If user mentions "Twitter", workflow MUST include Twitter node
2. ✅ **Transparency**: User sees what will be included
3. ✅ **Reliability**: No risk of missing explicitly mentioned platforms
4. ✅ **Better UX**: User gets exactly what they asked for

**Implementation Priority**:
1. **High**: Post-process keyword extraction (catch Twitter, LinkedIn, Facebook)
2. **High**: Pass mandatory nodes to planner
3. **Medium**: Enforce mandatory nodes in planner
4. **Medium**: UI updates to show mandatory nodes
5. **Low**: Advanced edge connection for parallel outputs

**Result**:
- ✅ All mentioned platforms are extracted as keywords
- ✅ Keywords are mapped to node types
- ✅ Mandatory nodes are enforced in workflow
- ✅ User sees exactly what will be generated
- ✅ Workflow includes all requested platforms

---

## 🔄 Current vs. Recommended Flow

### Current Flow (Problematic)
```
User Prompt → AI Generates Keywords → UI Shows Keywords → Planner Ignores Keywords → Workflow May Miss Nodes
```

### Recommended Flow (Fixed)
```
User Prompt → Extract ALL Keywords → Map to Node Types → Pass as Mandatory → Planner Enforces → Workflow Includes All
```

---

## 📝 Next Steps

1. **Implement post-processing keyword extraction**
2. **Add keyword-to-node mapping**
3. **Modify planner to accept mandatory nodes**
4. **Add validation for mandatory nodes**
5. **Update UI to show mandatory nodes**

This ensures that **all mentioned platforms are extracted, mapped, and included in the generated workflow**.
