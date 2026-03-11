# Better Approach Analysis: Operation Extraction

## 🔍 Current Approach (Proposed) - Issues

### Approach 1: Add `nodeMentions` to SimpleIntent
**Problems:**
- ❌ Changes SimpleIntent structure (breaking change)
- ❌ Duplicates extraction (already done by keyword extraction)
- ❌ Operations extracted too early (before schema access)
- ❌ More complex SimpleIntent validation

---

## ✅ Better Approach: Enhance Existing Infrastructure

### Why This Is Better

1. **Reuses Existing Infrastructure**
   - Keyword extraction already extracts node types
   - `mandatoryNodes` already passed to IntentAwarePlanner
   - No SimpleIntent structure changes needed

2. **Operations Determined at Right Stage**
   - Planning stage has full schema access
   - Can map verbs to operations using schema
   - More accurate operation selection

3. **More Efficient**
   - Single extraction pass (keyword extraction)
   - No duplicate extraction
   - Less code changes

4. **Universal**
   - Works for all nodes (schema-based)
   - No hardcoded operations

---

## 🎯 Better Solution Architecture

### Step 1: Enhance Keyword Extraction (Operation Context)

**Location**: `worker/src/services/ai/summarize-layer.ts`
**Method**: `extractKeywordsFromPrompt()`

**Enhancement**: Extract operation context alongside node types

```typescript
// BEFORE: Only extracts node types
const extractedNodeTypes = this.mapKeywordsToNodeTypes(extractedKeywords);

// AFTER: Extract node types + operation hints
interface NodeTypeWithOperation {
  nodeType: string;
  operationHint?: string;  // Verb near the node (e.g., "monitoring", "integrated")
  context: string;  // Full context phrase
}

const extractedNodes: NodeTypeWithOperation[] = this.extractNodesWithOperations(
  userPrompt, 
  allKeywordData
);
```

**How It Works:**
1. Extract node types (existing logic)
2. Find verbs near each node mention
3. Store operation hints (not final operations - just hints)

**Example:**
```
Prompt: "Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"

Extracted:
[
  { nodeType: "github", operationHint: "monitoring", context: "Repo monitoring for GitHub" },
  { nodeType: "gitlab", operationHint: "monitoring", context: "Repo monitoring for GitLab" },
  { nodeType: "bitbucket", operationHint: "monitoring", context: "Repo monitoring for Bitbucket" },
  { nodeType: "jenkins", operationHint: "integrated", context: "integrated with Jenkins" }
]
```

---

### Step 2: Pass Operation Hints to Planner

**Location**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`
**Change**: Pass operation hints alongside mandatory nodes

```typescript
// BEFORE:
const mandatoryNodes = options?.mandatoryNodeTypes || [];
const planningResult = await intentAwarePlanner.planWorkflow(
  finalSimpleIntent, 
  selectedStructuredPrompt, 
  mandatoryNodes
);

// AFTER:
interface MandatoryNodeInfo {
  nodeType: string;
  operationHint?: string;  // Verb hint from prompt
  context?: string;  // Context phrase
}

const mandatoryNodesWithHints: MandatoryNodeInfo[] = options?.mandatoryNodeTypes?.map(nodeType => ({
  nodeType,
  operationHint: options.operationHints?.[nodeType],
  context: options.nodeContexts?.[nodeType]
})) || [];

const planningResult = await intentAwarePlanner.planWorkflow(
  finalSimpleIntent, 
  selectedStructuredPrompt, 
  mandatoryNodesWithHints  // Enhanced structure
);
```

---

### Step 3: Map Operations Using Schema (Planning Stage)

**Location**: `worker/src/services/ai/intent-aware-planner.ts`
**Method**: `enforceMandatoryNodes()`

**Current Problem:**
```typescript
// ❌ HARDCODED OPERATIONS (Current)
operation: category === 'dataSource' ? 'read' : 
           category === 'transformation' ? 'transform' : 
           'send'
```

**Better Solution:**
```typescript
// ✅ SCHEMA-BASED OPERATION MAPPING
private mapOperationFromHint(
  nodeType: string,
  operationHint: string | undefined,
  category: 'dataSource' | 'transformation' | 'output'
): string {
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (!nodeDef) {
    // Fallback to category-based default
    return category === 'dataSource' ? 'read' : 
           category === 'transformation' ? 'transform' : 
           'send';
  }
  
  // ✅ Get operations from schema
  const availableOperations = this.getOperationsFromSchema(nodeDef);
  
  // ✅ Map operation hint to schema operation
  if (operationHint) {
    const mappedOperation = this.mapVerbToOperation(operationHint, availableOperations);
    if (mappedOperation) {
      return mappedOperation;
    }
  }
  
  // ✅ Fallback: Use default operation from schema
  return this.getDefaultOperation(nodeDef, category);
}

/**
 * ✅ UNIVERSAL: Map verb to operation using schema operations
 */
private mapVerbToOperation(
  verb: string,
  availableOperations: string[]
): string | null {
  const verbLower = verb.toLowerCase();
  
  // ✅ Semantic mapping (not hardcoded)
  const verbToOperationMap: Record<string, string[]> = {
    'monitoring': ['listRepos', 'getRepo', 'getWorkflowRuns', 'listCommits'],
    'monitor': ['listRepos', 'getRepo', 'getWorkflowRuns'],
    'integrated': ['build_job', 'get_build_status', 'poll_build_status'],
    'integrate': ['build_job', 'get_build_status'],
    'read': ['read', 'get', 'list', 'fetch'],
    'send': ['send', 'post', 'create', 'push'],
    'write': ['write', 'update', 'create', 'post'],
    // ... more mappings
  };
  
  // Find matching operations
  for (const [key, operations] of Object.entries(verbToOperationMap)) {
    if (verbLower.includes(key)) {
      // Find first matching operation in schema
      for (const op of operations) {
        if (availableOperations.includes(op)) {
          return op;
        }
      }
    }
  }
  
  return null;
}
```

---

## 📊 Comparison

### Current Approach (Proposed)
- ❌ Changes SimpleIntent structure
- ❌ Duplicates extraction
- ❌ Operations extracted too early
- ❌ More validation complexity

### Better Approach (Recommended)
- ✅ Reuses existing infrastructure
- ✅ No SimpleIntent changes
- ✅ Operations determined at planning stage (schema access)
- ✅ More efficient (single extraction)
- ✅ Universal (schema-based)

---

## 🎯 Implementation Steps

### Step 1: Enhance Keyword Extraction
**File**: `worker/src/services/ai/summarize-layer.ts`
**Method**: `extractKeywordsFromPrompt()`
**Change**: Extract operation hints alongside node types

### Step 2: Pass Operation Hints
**File**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`
**Change**: Pass operation hints to IntentAwarePlanner

### Step 3: Map Operations Using Schema
**File**: `worker/src/services/ai/intent-aware-planner.ts`
**Method**: `enforceMandatoryNodes()`
**Change**: Use schema to map operations (not hardcoded)

---

## ✅ Summary

**Better Approach:**
1. Enhance existing keyword extraction to include operation hints
2. Pass hints to planner (not final operations)
3. Map operations using schema at planning stage

**Why Better:**
- Reuses existing infrastructure
- No breaking changes
- Operations determined where schema is available
- Universal and efficient
