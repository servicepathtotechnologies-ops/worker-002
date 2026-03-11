# ✅ OPERATIONS-FIRST IMPLEMENTATION TODO

## 🎯 Implementation Strategy
**Operations-First Approach**: Extract node mentions → Enrich with operations from schema → Pass to AI → Generate variations with exact operations → Use directly in later stages.

---

## 📋 PHASE 1: Enhance Node Mentions with Operations

### ✅ Task 1.1: Update SimpleIntent Interface
**File**: `worker/src/services/ai/simple-intent.ts`
**Lines**: 78-83

**Changes**:
```typescript
nodeMentions?: Array<{
  nodeType: string;
  context: string;
  verbs?: string[];
  confidence: number;
  // ✅ ADD THESE:
  operations?: string[]; // All operations from node's schema
  defaultOperation?: string; // Default operation from node's schema
}>;
```

**Dependencies**: None
**Estimated Time**: 5 minutes

---

### ✅ Task 1.2: Add getOperationsFromNodeSchema() to IntentExtractor
**File**: `worker/src/services/ai/intent-extractor.ts`
**Location**: After `extractNodeMentions()` method

**Implementation**:
- Create private method `getOperationsFromNodeSchema(nodeDef: UnifiedNodeDefinition): string[]`
- Extract from `inputSchema.operation` (enum or oneOf)
- Return array of operations

**Dependencies**: Task 1.1
**Estimated Time**: 15 minutes

---

### ✅ Task 1.3: Add getDefaultOperationFromNode() to IntentExtractor
**File**: `worker/src/services/ai/intent-extractor.ts`
**Location**: After `getOperationsFromNodeSchema()`

**Implementation**:
- Create private method `getDefaultOperationFromNode(nodeDef: UnifiedNodeDefinition): string`
- Try `defaultConfig().operation` first
- Fallback to first operation from schema

**Dependencies**: Task 1.2
**Estimated Time**: 10 minutes

---

### ✅ Task 1.4: Enrich extractNodeMentions() with Operations
**File**: `worker/src/services/ai/intent-extractor.ts`
**Lines**: 139-266

**Changes**:
- After extracting node mentions, loop through and enrich each
- Call `getOperationsFromNodeSchema()` and `getDefaultOperationFromNode()`
- Add `operations` and `defaultOperation` to each mention

**Implementation**:
```typescript
// After line 265 (before return result):
// ✅ Enrich with operations from node schema
for (const mention of result) {
  const nodeDef = registry.get(mention.nodeType);
  if (nodeDef) {
    mention.operations = this.getOperationsFromNodeSchema(nodeDef);
    mention.defaultOperation = this.getDefaultOperationFromNode(nodeDef);
  }
}
```

**Dependencies**: Tasks 1.2, 1.3
**Estimated Time**: 10 minutes

---

## 📋 PHASE 2: Enhance Variation Generation with Operations

**Note**: SummarizeLayer is called BEFORE IntentExtractor, so we enrich nodeMentions WITHIN SummarizeLayer itself.

## 📋 PHASE 2: Enhance Variation Generation with Operations

### ✅ Task 2.1: Add enrichNodeMentionsWithOperations() to SummarizeLayer
**File**: `worker/src/services/ai/summarize-layer.ts`
**Location**: After `extractNodesWithOperations()` method

**Implementation**:
- Create private method `enrichNodeMentionsWithOperations()`
- Takes nodeMentions array
- Enriches with operations from registry if not already enriched
- Returns enriched array

**Dependencies**: Phase 1 complete
**Estimated Time**: 20 minutes

---

### ✅ Task 2.2: Update buildClarificationPrompt() Signature
**File**: `worker/src/services/ai/summarize-layer.ts`
**Lines**: 1076

**Changes**:
- Add parameter: `nodeMentionsWithOperations?: Array<{ nodeType: string; operations: string[]; defaultOperation: string }>`

**Dependencies**: Task 2.1
**Estimated Time**: 5 minutes

---

### ✅ Task 2.3: Add Operations Section to AI Prompt
**File**: `worker/src/services/ai/summarize-layer.ts`
**Lines**: 1076-1162

**Changes**:
- After `extractedKeywordsSection`, add `operationsSection`
- Include each node with its available operations
- Instruct AI to use exact operations from schema

**Implementation**:
```typescript
let operationsSection = '';
if (nodeMentionsWithOperations && nodeMentionsWithOperations.length > 0) {
  operationsSection = `
🚨🚨🚨 CRITICAL - NODE OPERATIONS (FROM NODE SCHEMAS):
Each node has specific operations available. You MUST use these exact operations:

${nodeMentionsWithOperations.map(node => {
  return `- ${node.nodeType}:
  * Available operations: ${node.operations.join(', ')}
  * Default operation: ${node.defaultOperation}
  * Example: "Use ${node.nodeType} with operation='${node.defaultOperation}' to..."`
}).join('\n\n')}

ABSOLUTE REQUIREMENTS:
1. Use ONLY the operations listed above for each node
2. Include the operation in your variation text
3. DO NOT invent operations - use only what's in the schema
`;
}
```

**Dependencies**: Task 2.2
**Estimated Time**: 20 minutes

---

### ✅ Task 2.4: Update clarifyIntentAndGenerateVariations() to Enrich nodeMentions
**File**: `worker/src/services/ai/summarize-layer.ts`
**Lines**: 268-479

**Changes**:
- After extracting nodeTypes, enrich them with operations
- Call `enrichNodeMentionsWithOperations()` with extractedNodeTypes
- Pass enriched nodeMentions to `buildClarificationPrompt()`

**Implementation**:
```typescript
async clarifyIntentAndGenerateVariations(userPrompt: string): Promise<SummarizeLayerResult> {
  // ... existing code up to extractedNodeTypes ...
  
  // ✅ NEW: Enrich extractedNodeTypes with operations from node schema
  let enrichedNodeMentions: Array<{
    nodeType: string;
    operations: string[];
    defaultOperation: string;
  }> = [];
  
  if (extractedNodeTypes.length > 0) {
    // Create basic mentions from extractedNodeTypes
    const basicMentions = extractedNodeTypes.map(nodeType => ({
      nodeType,
      context: userPrompt,
      confidence: 0.9,
    }));
    
    // ✅ Enrich with operations from node schema
    enrichedNodeMentions = this.enrichNodeMentionsWithOperations(basicMentions);
    
    console.log(`[AIIntentClarifier] ✅ Enriched ${enrichedNodeMentions.length} node(s) with operations from schema`);
  }
  
  // Update buildClarificationPrompt call (around line 310):
  const aiPrompt = this.buildClarificationPrompt(
    userPrompt,
    allKeywordData.map(k => k.keyword),
    extractedNodeTypes,
    enrichedNodeMentions // ✅ Pass enriched nodeMentions with operations
  );
  
  // ... rest of code ...
}
```

**Dependencies**: Tasks 2.1, 2.2, 2.3
**Estimated Time**: 15 minutes

---

### ✅ Task 2.5: Update parseAIResponse() to Include Operations
**File**: `worker/src/services/ai/summarize-layer.ts`
**Lines**: 1546-1688

**Changes**:
- When creating `mandatoryNodesWithOperations`, include operations from enriched nodeMentions
- Pass operations to validation

**Dependencies**: Task 2.4
**Estimated Time**: 10 minutes

---

## 📋 PHASE 3: Fix IntentAwarePlanner - Skip Triggers & Use Registry Category

### ✅ Task 3.1: Skip Trigger Nodes in determineRequiredNodes()
**File**: `worker/src/services/ai/intent-aware-planner.ts`
**Lines**: 215-265

**Changes**:
- Add check: `if (nodeDef?.category === 'trigger') continue;`
- Before categorization logic

**Implementation**:
```typescript
for (const mention of intent.nodeMentions) {
  // ... existing duplicate check ...
  
  const nodeDef = unifiedNodeRegistry.get(mention.nodeType);
  if (!nodeDef) {
    console.warn(`[IntentAwarePlanner] ⚠️  Node mention "${mention.nodeType}" not found in registry, skipping`);
    continue;
  }
  
  // ✅ NEW: Skip triggers - they're handled separately
  if (nodeDef.category === 'trigger') {
    console.log(`[IntentAwarePlanner] ⚠️  Skipping trigger node ${mention.nodeType} - triggers handled separately`);
    continue; // Don't add to nodes array
  }
  
  // ... rest of existing code ...
}
```

**Dependencies**: None
**Estimated Time**: 10 minutes

---

### ✅ Task 3.2: Use Registry Category Directly for Categorization
**File**: `worker/src/services/ai/intent-aware-planner.ts`
**Lines**: 228-236

**Changes**:
- Replace capability-based categorization with registry category mapping
- Direct mapping: registry category → DSL category

**Implementation**:
```typescript
// ✅ NEW: Use registry category directly (not capability-based)
const registryCategory = nodeDef.category;

// Direct mapping (no derivation)
const categoryMap: Record<string, 'dataSource' | 'transformation' | 'output'> = {
  'data': 'dataSource',
  'communication': 'output',
  'ai': 'transformation',
  'transformation': 'transformation',
  'logic': 'transformation',
  'utility': 'transformation',
};

let category: 'dataSource' | 'transformation' | 'output' = categoryMap[registryCategory] || 'transformation';
```

**Dependencies**: Task 3.1
**Estimated Time**: 15 minutes

---

### ✅ Task 3.3: Use Operations from Enriched nodeMentions
**File**: `worker/src/services/ai/intent-aware-planner.ts`
**Lines**: 238-254

**Changes**:
- Check if `mention.operations` exists (from enrichment)
- Use operations from mention if available
- Fallback to NodeOperationIndex only if not enriched

**Implementation**:
```typescript
// ✅ Use operations from enriched nodeMentions if available
let operation: string;
if (mention.operations && mention.operations.length > 0) {
  // Operations already enriched from schema
  if (mention.verbs && mention.verbs.length > 0) {
    // Find best matching operation from node's operations
    const { nodeOperationIndex } = await import('../../core/registry/node-operation-index');
    nodeOperationIndex.initialize();
    const operationMatch = nodeOperationIndex.findBestOperation(mention.nodeType, mention.verbs);
    if (operationMatch && mention.operations.includes(operationMatch.operation)) {
      operation = operationMatch.operation;
    } else {
      operation = mention.defaultOperation || mention.operations[0];
    }
  } else {
    operation = mention.defaultOperation || mention.operations[0];
  }
} else {
  // Fallback: use NodeOperationIndex (if not enriched)
  const { nodeOperationIndex } = await import('../../core/registry/node-operation-index');
  nodeOperationIndex.initialize();
  if (mention.verbs && mention.verbs.length > 0) {
    const operationMatch = nodeOperationIndex.findBestOperation(mention.nodeType, mention.verbs);
    if (operationMatch) {
      operation = operationMatch.operation;
    } else {
      const defaultOp = nodeOperationIndex.getDefaultOperation(mention.nodeType);
      operation = defaultOp || await this.mapOperationFromHint(mention.nodeType, mention.verbs[0], category, nodeDef);
    }
  } else {
    const defaultOp = nodeOperationIndex.getDefaultOperation(mention.nodeType);
    operation = defaultOp || await this.mapOperationFromHint(mention.nodeType, undefined, category, nodeDef);
  }
}
```

**Dependencies**: Task 3.2
**Estimated Time**: 20 minutes

---

## 📋 PHASE 4: Fix DSLGenerator - Registry-First Categorization

### ✅ Task 4.1: Add getOperationsFromNodeSchema() to DSLGenerator
**File**: `worker/src/services/ai/workflow-dsl.ts`
**Location**: After `determineCategoryFromSchema()` method

**Implementation**:
- Create private method `getOperationsFromNodeSchema(nodeDef: UnifiedNodeDefinition): string[]`
- Same implementation as IntentExtractor

**Dependencies**: None
**Estimated Time**: 10 minutes

---

### ✅ Task 4.2: Add getDefaultOperationFromNode() to DSLGenerator
**File**: `worker/src/services/ai/workflow-dsl.ts`
**Location**: After `getOperationsFromNodeSchema()`

**Implementation**:
- Create private method `getDefaultOperationFromNode(nodeDef: UnifiedNodeDefinition): string`
- Same implementation as IntentExtractor

**Dependencies**: Task 4.1
**Estimated Time**: 10 minutes

---

### ✅ Task 4.3: Fix determineCategoryFromSchema() - Registry First
**File**: `worker/src/services/ai/workflow-dsl.ts`
**Lines**: 1744-1785

**Changes**:
- Check registry category FIRST
- Throw error for triggers
- Direct mapping (no operation semantics)
- Validate operation exists in schema

**Implementation**:
```typescript
private determineCategoryFromSchema(schema: any, operation: string): 'dataSource' | 'transformation' | 'output' {
  // ✅ STEP 1: Get node definition
  const nodeDef = unifiedNodeRegistry.get(schema.type);
  if (!nodeDef) {
    throw new Error(`Node ${schema.type} not found in registry`);
  }
  
  // ✅ STEP 2: Check registry category FIRST (respect individuality)
  const registryCategory = nodeDef.category;
  
  // ✅ SPECIAL NODES: Handle separately
  if (registryCategory === 'trigger') {
    throw new Error(`Node ${schema.type} is a TRIGGER (category: trigger) but was passed to determineCategoryFromSchema. Triggers should be handled separately.`);
  }
  
  if (registryCategory === 'logic') {
    return 'transformation'; // Logic nodes go in transformations
  }
  
  // ✅ STEP 3: Direct mapping (no derivation)
  const categoryMap: Record<string, 'dataSource' | 'transformation' | 'output'> = {
    'data': 'dataSource',
    'communication': 'output',
    'ai': 'transformation',
    'transformation': 'transformation',
    'utility': 'transformation',
  };
  
  const dslCategory = categoryMap[registryCategory];
  
  if (!dslCategory) {
    throw new Error(`Unknown registry category "${registryCategory}" for node ${schema.type}`);
  }
  
  // ✅ STEP 4: Validate operation exists in node's schema
  const nodeOperations = this.getOperationsFromNodeSchema(nodeDef);
  if (operation && !nodeOperations.includes(operation)) {
    console.warn(`[DSLGenerator] ⚠️  Operation "${operation}" not in ${schema.type} schema. Available: ${nodeOperations.join(', ')}`);
    // Use default operation
    const defaultOp = this.getDefaultOperationFromNode(nodeDef);
    if (defaultOp && nodeOperations.includes(defaultOp)) {
      operation = defaultOp;
    } else if (nodeOperations.length > 0) {
      operation = nodeOperations[0];
    }
  }
  
  console.log(`[DSLGenerator] ✅ Categorized ${schema.type} as ${dslCategory} (registry: ${registryCategory}, operation: ${operation})`);
  return dslCategory;
}
```

**Dependencies**: Tasks 4.1, 4.2
**Estimated Time**: 25 minutes

---

### ✅ Task 4.4: Add Trigger Check in generateDSL() DataSource Processing
**File**: `worker/src/services/ai/workflow-dsl.ts`
**Lines**: 536-571

**Changes**:
- Before categorization, check if node is trigger
- Skip if trigger (don't add to dataSources)

**Implementation**:
```typescript
// In generateDSL(), when processing intent.dataSources:
for (const ds of intent.dataSources) {
  // ... existing type resolution ...
  
  // ✅ NEW: Check if it's a trigger BEFORE categorization
  const nodeDef = unifiedNodeRegistry.get(dsType);
  if (nodeDef?.category === 'trigger') {
    console.warn(`[DSLGenerator] ⚠️  DataSource "${dsType}" is actually a TRIGGER. This should not happen - triggers should be in trigger field.`);
    continue; // Don't add to dataSources
  }
  
  // ... rest of categorization ...
}
```

**Dependencies**: Task 4.3
**Estimated Time**: 10 minutes

---

## 📋 PHASE 5: Type Safety & Integration

### ✅ Task 5.1: Update All Type References
**Files**: 
- `worker/src/services/ai/simple-intent.ts` (already done in Task 1.1)
- `worker/src/services/ai/summarize-layer.ts` (update NodeTypeWithOperation if needed)
- `worker/src/services/ai/intent-aware-planner.ts` (update method signatures)

**Changes**:
- Ensure all places using nodeMentions handle operations field
- Update method signatures to accept operations

**Dependencies**: Phase 1-4 complete
**Estimated Time**: 15 minutes

---

### ✅ Task 5.2: Remove Operation Semantics Dependency
**File**: `worker/src/services/ai/workflow-dsl.ts`
**Lines**: 1752-1757

**Changes**:
- Remove `getOperationSemantic()` and `getDSLCategoryFromSemantic()` calls
- Use registry category directly

**Dependencies**: Task 4.3
**Estimated Time**: 5 minutes

---

### ✅ Task 5.3: Update validateOperationRequirements() if Needed
**File**: `worker/src/services/ai/workflow-dsl.ts`
**Lines**: 397-463

**Changes**:
- Check if still using operation semantics
- Update to use registry category if needed

**Dependencies**: Task 4.3
**Estimated Time**: 10 minutes

---

### ✅ Task 5.4: Test Complete Flow
**Test Cases**:

1. **Test 1: Node Mentions with Operations**
   - Prompt: "Export results via github"
   - Verify: nodeMentions includes github with operations: ['create_issue', 'list_repos', ...]

2. **Test 2: Variation Generation with Operations**
   - Verify: AI prompt includes operations for each node
   - Verify: Variations mention exact operations

3. **Test 3: Trigger Skipping**
   - Prompt: "Use manual_trigger to start workflow"
   - Verify: manual_trigger NOT in dataSources/outputs/transformations

4. **Test 4: Registry Category Direct Mapping**
   - Prompt: "Read from google_sheets, send to gmail"
   - Verify: google_sheets → dataSource (category: data)
   - Verify: gmail → output (category: communication)

5. **Test 5: Operation Validation**
   - Prompt: "Use github with invalid_operation"
   - Verify: System uses default operation from schema

**Dependencies**: All phases complete
**Estimated Time**: 30 minutes

---

## 📊 Implementation Summary

### **Total Tasks**: 18
### **Estimated Time**: ~3.5 hours
### **Complexity**: Medium (well-defined, clear stages)

### **Critical Path**:
1. Phase 1 (40 min) → Phase 2 (70 min) → Phase 3 (45 min) → Phase 4 (55 min) → Phase 5 (30 min)

### **Dependencies**:
- Phase 1 must complete before Phase 2
- Phase 2 must complete before Phase 3
- Phase 3 and Phase 4 can be done in parallel (different files)
- Phase 5 requires all previous phases

---

## ✅ Success Criteria

After implementation:
- ✅ Node mentions include operations from schema
- ✅ AI generates variations with exact operations
- ✅ Triggers never categorized incorrectly
- ✅ Registry category used directly
- ✅ Operations validated against schema
- ✅ No hardcoding - all from registry
- ✅ Simple flow - no complexity

---

## 🚨 Risk Mitigation

1. **Risk**: Operations not available in some nodes
   - **Mitigation**: Fallback to NodeOperationIndex if schema doesn't have operations

2. **Risk**: TypeScript errors from interface changes
   - **Mitigation**: Update all type references in Phase 5

3. **Risk**: Breaking existing workflows
   - **Mitigation**: Operations field is optional, backward compatible

---

## 📝 Notes

- **No breaking changes**: Operations field is optional
- **Backward compatible**: Existing code works if operations not enriched
- **Progressive enhancement**: Operations enrich when available
- **Simple stages**: Each phase is independent and testable
