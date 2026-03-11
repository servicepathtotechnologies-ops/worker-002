# ✅ OPERATIONS-FIRST IMPLEMENTATION PLAN

## 🎯 Objective
Implement operations-first approach where:
1. **Node mentions extracted** → Operations enriched from node schema
2. **AI generates variations** → With exact operations for each node
3. **Later stages** → Use operations directly (no derivation needed)

---

## 📋 PHASE 1: Enhance Node Mentions Extraction

### **Task 1.1: Update SimpleIntent Interface**
**File**: `worker/src/services/ai/simple-intent.ts`

**Changes**:
```typescript
export interface SimpleIntent {
  // ... existing fields ...
  nodeMentions?: Array<{
    nodeType: string;
    context: string;
    verbs?: string[];
    confidence: number;
    // ✅ NEW: Operations from node schema
    operations?: string[]; // All operations from node's schema
    defaultOperation?: string; // Default operation from node's schema
  }>;
}
```

**Why**: Store operations directly in nodeMentions so they're available throughout the pipeline.

---

### **Task 1.2: Enhance IntentExtractor.extractNodeMentions()**
**File**: `worker/src/services/ai/intent-extractor.ts`

**Changes**:
- After extracting node mentions, enrich each with operations from node schema
- Add `getOperationsFromNodeSchema()` helper method
- Return enriched nodeMentions with operations

**Implementation**:
```typescript
private async extractNodeMentions(userPrompt: string): Promise<Array<{
  nodeType: string;
  context: string;
  verbs?: string[];
  confidence: number;
  operations?: string[]; // ✅ NEW
  defaultOperation?: string; // ✅ NEW
}>> {
  // ... existing extraction logic ...
  
  // ✅ NEW: Enrich with operations from node schema
  for (const mention of mentions) {
    const nodeDef = registry.get(mention.nodeType);
    if (nodeDef) {
      mention.operations = this.getOperationsFromNodeSchema(nodeDef);
      mention.defaultOperation = this.getDefaultOperationFromNode(nodeDef);
    }
  }
  
  return mentions;
}

/**
 * ✅ Get operations directly from node's schema
 */
private getOperationsFromNodeSchema(nodeDef: UnifiedNodeDefinition): string[] {
  const operations: string[] = [];
  
  if (nodeDef.inputSchema?.operation) {
    const opField = nodeDef.inputSchema.operation;
    if (opField.type === 'string' && (opField as any).enum) {
      operations.push(...((opField as any).enum as string[]));
    } else if ((opField as any).oneOf) {
      for (const option of (opField as any).oneOf) {
        if (option.const) {
          operations.push(option.const);
        }
      }
    }
  }
  
  return operations;
}

/**
 * ✅ Get default operation from node's schema
 */
private getDefaultOperationFromNode(nodeDef: UnifiedNodeDefinition): string {
  try {
    const defaultConfig = nodeDef.defaultConfig();
    if (defaultConfig.operation && typeof defaultConfig.operation === 'string') {
      return defaultConfig.operation;
    }
  } catch (error) {
    // Ignore
  }
  
  // Fallback: first operation from schema
  const operations = this.getOperationsFromNodeSchema(nodeDef);
  return operations.length > 0 ? operations[0] : '';
}
```

**Why**: Operations available immediately after extraction, no need to derive later.

---

## 📋 PHASE 2: Enhance Variation Generation

### **Task 2.1: Create enrichNodeMentionsWithOperations() in SummarizeLayer**
**File**: `worker/src/services/ai/summarize-layer.ts`

**Changes**:
- Add method to enrich nodeMentions with operations if not already enriched
- Use as fallback if IntentExtractor didn't enrich

**Implementation**:
```typescript
/**
 * ✅ Enrich node mentions with operations from node schema
 * Called BEFORE variation generation to ensure AI has operations
 */
private enrichNodeMentionsWithOperations(
  nodeMentions: Array<{ nodeType: string; context: string; verbs?: string[]; confidence: number }>
): Array<{
  nodeType: string;
  context: string;
  verbs?: string[];
  confidence: number;
  operations: string[];
  defaultOperation: string;
}> {
  const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
  const registry = unifiedNodeRegistry;
  
  return nodeMentions.map(mention => {
    // Skip if already enriched
    if ((mention as any).operations) {
      return mention as any;
    }
    
    const nodeDef = registry.get(mention.nodeType);
    if (!nodeDef) {
      return { ...mention, operations: [], defaultOperation: '' };
    }
    
    const operations = this.getOperationsFromNodeSchema(nodeDef);
    const defaultOperation = this.getDefaultOperationFromNode(nodeDef);
    
    return {
      ...mention,
      operations,
      defaultOperation,
    };
  });
}

private getOperationsFromNodeSchema(nodeDef: any): string[] {
  // Same implementation as IntentExtractor
}

private getDefaultOperationFromNode(nodeDef: any): string {
  // Same implementation as IntentExtractor
}
```

**Why**: Ensures operations are available even if IntentExtractor didn't enrich them.

---

### **Task 2.2: Enhance buildClarificationPrompt() with Operations**
**File**: `worker/src/services/ai/summarize-layer.ts`

**Changes**:
- Accept enriched nodeMentions with operations
- Include operations in AI prompt
- Instruct AI to use exact operations

**Implementation**:
```typescript
private buildClarificationPrompt(
  userPrompt: string,
  allKeywords: string[],
  extractedNodeTypes: string[] = [],
  nodeMentionsWithOperations?: Array<{ // ✅ NEW parameter
    nodeType: string;
    operations: string[];
    defaultOperation: string;
  }>
): string {
  // ... existing code ...
  
  // ✅ NEW: Add operations section
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
2. If user mentions a verb (e.g., "export"), map it to the closest operation from the node's available operations
3. Include the operation in your variation text (e.g., "Use github with create_issue operation")
4. DO NOT invent operations - use only what's in the schema

`;
  }
  
  return `User Prompt: "${userPrompt}"

${operationsSection}
${extractedKeywordsSection}
...`;
}
```

**Why**: AI generates variations with exact operations, preventing operation mismatches.

---

### **Task 2.3: Update clarifyIntentAndGenerateVariations() Flow**
**File**: `worker/src/services/ai/summarize-layer.ts`

**Changes**:
- Call enrichNodeMentionsWithOperations() BEFORE calling AI
- Pass enriched nodeMentions to buildClarificationPrompt()

**Implementation**:
```typescript
async clarifyIntentAndGenerateVariations(userPrompt: string): Promise<SummarizeLayerResult> {
  // ... existing code ...
  
  // ✅ NEW: Get nodeMentions from SimpleIntent (if available)
  // This should come from IntentExtractor, but enrich if needed
  let nodeMentionsWithOperations: Array<{
    nodeType: string;
    operations: string[];
    defaultOperation: string;
  }> = [];
  
  // Try to get from SimpleIntent if available
  // Otherwise, extract and enrich here
  if (extractedNodeTypes.length > 0) {
    // Create basic nodeMentions from extractedNodeTypes
    const basicMentions = extractedNodeTypes.map(nodeType => ({
      nodeType,
      context: userPrompt,
      confidence: 0.9,
    }));
    
    // ✅ Enrich with operations
    nodeMentionsWithOperations = this.enrichNodeMentionsWithOperations(basicMentions);
  }
  
  // ✅ Pass to buildClarificationPrompt
  const aiPrompt = this.buildClarificationPrompt(
    userPrompt,
    allKeywordData.map(k => k.keyword),
    extractedNodeTypes,
    nodeMentionsWithOperations // ✅ NEW
  );
  
  // ... rest of code ...
}
```

**Why**: Operations available to AI before variation generation.

---

## 📋 PHASE 3: Fix IntentAwarePlanner

### **Task 3.1: Skip Trigger Nodes in determineRequiredNodes()**
**File**: `worker/src/services/ai/intent-aware-planner.ts`

**Changes**:
- Check if node is trigger BEFORE categorization
- Skip triggers (they're handled separately)

**Implementation**:
```typescript
private async determineRequiredNodes(
  intent: SimpleIntent,
  originalPrompt?: string
): Promise<NodeRequirement[]> {
  // ... existing code ...
  
  if (intent.nodeMentions && intent.nodeMentions.length > 0) {
    for (const mention of intent.nodeMentions) {
      // ✅ NEW: Skip triggers - they're handled separately
      const nodeDef = unifiedNodeRegistry.get(mention.nodeType);
      if (nodeDef?.category === 'trigger') {
        console.log(`[IntentAwarePlanner] ⚠️  Skipping trigger node ${mention.nodeType} - triggers handled separately`);
        continue; // ✅ Don't add to nodes array
      }
      
      // ... rest of existing code ...
    }
  }
}
```

**Why**: Prevents triggers from being categorized as dataSource/output/transformation.

---

### **Task 3.2: Use Registry Category Directly for Categorization**
**File**: `worker/src/services/ai/intent-aware-planner.ts`

**Changes**:
- Use registry category → DSL category mapping (direct)
- No operation semantics derivation

**Implementation**:
```typescript
// In determineRequiredNodes(), when processing nodeMentions:
// ✅ NEW: Use registry category directly
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

// ✅ NEW: Get operation from nodeMentions if available
let operation: string;
if (mention.operations && mention.operations.length > 0) {
  // Use operation from nodeMentions (already enriched)
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
  // Fallback: use NodeOperationIndex
  const defaultOp = nodeOperationIndex.getDefaultOperation(mention.nodeType);
  operation = defaultOp || 'read';
}
```

**Why**: Direct category mapping, operations from enriched nodeMentions.

---

## 📋 PHASE 4: Fix DSLGenerator

### **Task 4.1: Fix determineCategoryFromSchema() - Registry First**
**File**: `worker/src/services/ai/workflow-dsl.ts`

**Changes**:
- Check registry category FIRST
- Throw error for triggers
- Direct mapping, no operation semantics

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

/**
 * ✅ Get operations directly from node's schema
 */
private getOperationsFromNodeSchema(nodeDef: UnifiedNodeDefinition): string[] {
  const operations: string[] = [];
  
  if (nodeDef.inputSchema?.operation) {
    const opField = nodeDef.inputSchema.operation;
    if (opField.type === 'string' && (opField as any).enum) {
      operations.push(...((opField as any).enum as string[]));
    } else if ((opField as any).oneOf) {
      for (const option of (opField as any).oneOf) {
        if (option.const) {
          operations.push(option.const);
        }
      }
    }
  }
  
  return operations;
}

/**
 * ✅ Get default operation from node's schema
 */
private getDefaultOperationFromNode(nodeDef: UnifiedNodeDefinition): string {
  try {
    const defaultConfig = nodeDef.defaultConfig();
    if (defaultConfig.operation && typeof defaultConfig.operation === 'string') {
      return defaultConfig.operation;
    }
  } catch (error) {
    // Ignore
  }
  
  const operations = this.getOperationsFromNodeSchema(nodeDef);
  return operations.length > 0 ? operations[0] : '';
}
```

**Why**: Registry-first categorization, operation validation, no derivation.

---

### **Task 4.2: Update DSL Processing to Handle Triggers**
**File**: `worker/src/services/ai/workflow-dsl.ts`

**Changes**:
- Check for triggers in dataSources before categorization
- Move triggers to trigger field (if found)

**Implementation**:
```typescript
// In generateDSL(), when processing dataSources:
if (intent.dataSources && intent.dataSources.length > 0) {
  for (const ds of intent.dataSources) {
    // ✅ NEW: Check if it's a trigger BEFORE categorization
    const nodeDef = unifiedNodeRegistry.get(dsType);
    if (nodeDef?.category === 'trigger') {
      console.warn(`[DSLGenerator] ⚠️  DataSource "${dsType}" is actually a TRIGGER. This should not happen - triggers should be in trigger field.`);
      // Don't add to dataSources - triggers are handled separately
      continue;
    }
    
    // ... rest of categorization ...
  }
}
```

**Why**: Prevents triggers from being added to dataSources.

---

## 📋 PHASE 5: Type Safety & Testing

### **Task 5.1: Update TypeScript Interfaces**
**Files**: 
- `worker/src/services/ai/simple-intent.ts`
- `worker/src/services/ai/summarize-layer.ts`

**Changes**:
- Add `operations?: string[]` to nodeMentions
- Add `defaultOperation?: string` to nodeMentions
- Update all related types

---

### **Task 5.2: Add Validation**
**File**: `worker/src/services/ai/workflow-dsl.ts`

**Changes**:
- Validate operations exist in node schema before use
- Log warnings for invalid operations
- Use default operation if invalid

---

### **Task 5.3: Test Complete Flow**
**Test Cases**:
1. Extract node mentions → Operations enriched
2. Generate variations → Operations included
3. Plan workflow → Triggers skipped, operations used
4. Generate DSL → Registry category used, operations validated

---

## ✅ Implementation Order

1. **Phase 1**: Update interfaces and enrich extraction
2. **Phase 2**: Enhance variation generation with operations
3. **Phase 3**: Fix planner to skip triggers and use registry category
4. **Phase 4**: Fix DSL generator to use registry category first
5. **Phase 5**: Type safety and testing

---

## 🎯 Success Criteria

- ✅ Node mentions include operations from schema
- ✅ AI generates variations with exact operations
- ✅ Triggers never categorized as dataSource/output/transformation
- ✅ Registry category used directly (no derivation)
- ✅ Operations validated against node schema
- ✅ No hardcoding - all from registry
- ✅ Simple stages - no complexity

---

## 📝 Notes

- **No semantic derivation**: Operations come directly from schema
- **Registry-first**: Category from registry, not operation semantics
- **Operations-first**: Operations available before variation generation
- **Simple flow**: Extract → Enrich → Generate → Use (direct)
