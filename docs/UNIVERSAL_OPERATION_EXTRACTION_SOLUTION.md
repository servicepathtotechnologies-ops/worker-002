# Universal Operation Extraction & Intent Mapping Solution

## 🔍 Root Cause Analysis

### Problem Statement
**Error**: `Intent has no actions or data sources - will be expanded by intent_auto_expander`

**Root Cause**: IntentAwarePlanner generates **0 actions** because:
1. SimpleIntent extraction extracts generic verbs ("start", "configure", "use") but **misses node types directly mentioned** in prompt
2. IntentAwarePlanner only maps `sources`, `destinations`, `transformations` - **does NOT map `verbs` to actions**
3. Operations are not extracted from user intent - they're hardcoded or inferred incorrectly

### Example Failure Case

**User Prompt**: 
```
"Start the automation process using webhook to begin daily tasks. 
Configure oauth2_auth for secure access to data sources. 
Use loop to iterate through multiple datasets and generate content dynamically. 
Manage workflow execution timing with log_output to ensure smooth operation. 
Finally, export results via github for version control and collaboration."
```

**What Happens**:
1. SimpleIntent extracts: `verbs: ["start", "configure", "use", "manage", "export"]` (generic verbs)
2. SimpleIntent extracts: `sources: []`, `destinations: []`, `transformations: []` (empty - node types not extracted)
3. IntentAwarePlanner.determineRequiredNodes() finds 0 sources, 0 destinations, 0 transformations
4. Result: **0 actions generated** → Workflow generation fails

**What Should Happen**:
1. Extract node types directly: `webhook`, `oauth2_auth`, `loop`, `log_output`, `github`
2. Extract operations from context: "using webhook" → `webhook` (trigger), "configure oauth2_auth" → `oauth2_auth` (action, operation: "authenticate"), "use loop" → `loop` (transformation), "via github" → `github` (output, operation: "push" or "commit")
3. Map verbs to operations: "export" → operation "push" or "commit" for github

---

## ✅ Universal Solution Architecture

### Core Principle
**Verbs = Operations** - User intent verbs directly map to node operations from schema (not hardcoded)

### Solution Components

#### 1. Enhanced SimpleIntent Extraction (Operation-Aware)

**Location**: `worker/src/services/ai/intent-extractor.ts`

**Enhancement**: Extract node types directly mentioned in prompt + their operation context

```typescript
// NEW: Extract operation-aware entities
{
  "verbs": ["start", "configure", "use", "manage", "export"],
  "sources": [],
  "destinations": [],
  "transformations": [],
  "nodeMentions": [  // ✅ NEW: Direct node type mentions
    {
      "nodeType": "webhook",
      "context": "using webhook to begin",
      "inferredOperation": "trigger",
      "category": "trigger"
    },
    {
      "nodeType": "oauth2_auth",
      "context": "configure oauth2_auth for secure access",
      "inferredOperation": "authenticate",
      "category": "action"
    },
    {
      "nodeType": "loop",
      "context": "use loop to iterate",
      "inferredOperation": "iterate",
      "category": "transformation"
    },
    {
      "nodeType": "log_output",
      "context": "manage workflow execution timing with log_output",
      "inferredOperation": "log",
      "category": "output"
    },
    {
      "nodeType": "github",
      "context": "export results via github",
      "inferredOperation": "push",  // From verb "export"
      "category": "output"
    }
  ]
}
```

#### 2. Universal Verb-to-Operation Mapping (Schema-Based)

**Location**: `worker/src/services/ai/intent-aware-planner.ts`

**Enhancement**: Map verbs to node operations using schema (not hardcoded)

```typescript
/**
 * ✅ UNIVERSAL: Map verb to node operation using schema
 * 
 * Priority:
 * 1. Check schema operations for verb match
 * 2. Use operation synonyms (send → notify, read → fetch)
 * 3. Use category defaults (dataSource → read, output → send)
 * 
 * @param verb - Verb from user intent (e.g., "export", "read", "send")
 * @param nodeType - Node type to get operations for
 * @param originalPrompt - Original prompt for context
 * @returns Operation from schema with confidence
 */
private mapVerbToNodeOperation(
  verb: string,
  nodeType: string,
  originalPrompt?: string
): { operation: string; confidence: number } {
  // Step 1: Get schema operations
  const { nodeLibrary } = require('../nodes/node-library');
  const schema = nodeLibrary.getSchema(nodeType);
  if (!schema) {
    return this.getDefaultOperationByCategory(nodeType);
  }
  
  // Step 2: Get available operations from schema
  const availableOperations = this.getSchemaOperations(schema);
  
  // Step 3: Match verb to operation using synonyms
  const verbLower = verb.toLowerCase();
  const operationMatch = this.findBestOperationMatch(verbLower, availableOperations);
  
  return operationMatch;
}
```

#### 3. Enhanced determineRequiredNodes() - Map Verbs to Actions

**Location**: `worker/src/services/ai/intent-aware-planner.ts`

**Enhancement**: Map verbs + node mentions to actions with operations

```typescript
private async determineRequiredNodes(
  intent: SimpleIntent,
  originalPrompt?: string
): Promise<NodeRequirement[]> {
  const nodes: NodeRequirement[] = [];
  const nodeIds = new Set<string>();
  
  // ✅ EXISTING: Map sources, destinations, transformations (keep as-is)
  // ... existing code ...
  
  // ✅ NEW: Map node mentions directly from prompt
  if (intent.nodeMentions && intent.nodeMentions.length > 0) {
    for (const mention of intent.nodeMentions) {
      const nodeType = await this.resolveNodeType(mention.nodeType);
      if (nodeType && !nodeIds.has(nodeType)) {
        // ✅ UNIVERSAL: Get operation from schema (not hardcoded)
        const operation = this.mapVerbToNodeOperation(
          mention.inferredOperation || mention.context,
          nodeType,
          originalPrompt
        );
        
        nodes.push({
          id: `${mention.category}_${nodes.length}`,
          type: nodeType,
          operation: operation.operation, // From schema
          category: mention.category as 'dataSource' | 'transformation' | 'output',
        });
        nodeIds.add(nodeType);
      }
    }
  }
  
  // ✅ NEW: Map verbs to actions (when node types are inferred from verbs)
  if (intent.verbs && intent.verbs.length > 0) {
    for (const verb of intent.verbs) {
      // Find node types that support this verb as operation
      const matchingNodes = await this.findNodesForVerb(verb, originalPrompt);
      
      for (const nodeType of matchingNodes) {
        if (!nodeIds.has(nodeType)) {
          const operation = this.mapVerbToNodeOperation(verb, nodeType, originalPrompt);
          const category = this.determineCategoryFromSchema(nodeType);
          
          nodes.push({
            id: `${category}_${nodes.length}`,
            type: nodeType,
            operation: operation.operation,
            category,
          });
          nodeIds.add(nodeType);
        }
      }
    }
  }
  
  return nodes;
}
```

---

## 🎯 Implementation Strategy

### Phase 1: Enhanced SimpleIntent Extraction

**File**: `worker/src/services/ai/intent-extractor.ts`

**Changes**:
1. Add `nodeMentions` field to SimpleIntent interface
2. Enhance LLM prompt to extract node types directly mentioned
3. Extract operation context from prompt (verb + node type proximity)

### Phase 2: Universal Operation Mapping

**File**: `worker/src/services/ai/intent-aware-planner.ts`

**Changes**:
1. Add `mapVerbToNodeOperation()` method (schema-based)
2. Add `getSchemaOperations()` helper (extract operations from schema)
3. Add `findBestOperationMatch()` helper (verb → operation matching with synonyms)
4. Enhance `determineRequiredNodes()` to map verbs + node mentions

### Phase 3: Schema Operation Extraction

**File**: `worker/src/core/registry/unified-node-registry.ts` (or new utility)

**Changes**:
1. Add method to extract available operations from node schema
2. Support operation synonyms mapping
3. Support category-based operation defaults

---

## 🔑 Key Benefits

1. **Universal**: Works for ALL nodes (uses schema, not hardcoded)
2. **Operation-Aware**: Extracts operations from user intent (verbs)
3. **Node Type Detection**: Extracts node types directly mentioned in prompt
4. **Schema-Based**: Operations come from node schema (always valid)
5. **Context-Aware**: Uses prompt context to infer operations

---

## 📋 Implementation Checklist

- [ ] Add `nodeMentions` to SimpleIntent interface
- [ ] Enhance SimpleIntent extraction prompt to extract node types
- [ ] Add `mapVerbToNodeOperation()` method (schema-based)
- [ ] Add `getSchemaOperations()` helper
- [ ] Add `findBestOperationMatch()` helper
- [ ] Enhance `determineRequiredNodes()` to map verbs + node mentions
- [ ] Add operation synonyms mapping
- [ ] Test with example prompt (webhook, oauth2_auth, loop, log_output, github)

---

## 🧪 Test Cases

### Test 1: Direct Node Type Mentions
**Input**: "Use webhook to start, configure oauth2_auth, use loop, log with log_output, export via github"
**Expected**: 5 actions with correct operations

### Test 2: Verb-Based Operation Inference
**Input**: "Read from Google Sheets, send to Gmail, create in HubSpot"
**Expected**: 3 actions with operations: read, send, create

### Test 3: Mixed (Node Types + Verbs)
**Input**: "Get data from sheets, use loop to process, send via slack_message"
**Expected**: 3 actions (sheets: read, loop: iterate, slack_message: send)

---

## 🚀 Next Steps

1. Review and approve this solution
2. Implement Phase 1 (SimpleIntent enhancement)
3. Implement Phase 2 (Operation mapping)
4. Implement Phase 3 (Schema extraction)
5. Test with real prompts
6. Deploy
