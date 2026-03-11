# ✅ OPERATIONS-FIRST IMPLEMENTATION - COMPLETE PLAN

## 🎯 Objective
Implement **operations-first approach** where operations are extracted from node schemas BEFORE variation generation, ensuring AI generates variations with exact operations.

---

## 📊 Implementation Flow

```
USER PROMPT
    ↓
[PHASE 1] IntentExtractor.extractNodeMentions()
    ├─ Extract node types from prompt
    └─ ✅ ENRICH: Add operations from node schema
    ↓
SimpleIntent.nodeMentions (with operations)
    ↓
[PHASE 2] SummarizeLayer.clarifyIntentAndGenerateVariations()
    ├─ Extract nodeTypes from keywords
    ├─ ✅ ENRICH: Add operations from node schema (if not already enriched)
    ├─ ✅ PASS: Include operations in AI prompt
    └─ AI generates variations with EXACT operations
    ↓
Prompt Variations (with operations in text)
    ↓
[PHASE 3] IntentAwarePlanner.determineRequiredNodes()
    ├─ ✅ SKIP: Trigger nodes (category='trigger')
    ├─ ✅ USE: Registry category directly (not operation semantics)
    └─ ✅ USE: Operations from enriched nodeMentions
    ↓
StructuredIntent (with correct categories and operations)
    ↓
[PHASE 4] DSLGenerator.determineCategoryFromSchema()
    ├─ ✅ CHECK: Registry category FIRST
    ├─ ✅ THROW: Error if trigger (shouldn't reach here)
    ├─ ✅ MAP: Registry category → DSL category directly
    └─ ✅ VALIDATE: Operation exists in node schema
    ↓
WorkflowDSL (correctly categorized, operations validated)
```

---

## 📋 PHASE 1: Enhance Node Mentions Extraction (40 min)

### **Task 1.1**: Update SimpleIntent Interface ✅
- **File**: `worker/src/services/ai/simple-intent.ts:78-83`
- **Change**: Add `operations?: string[]` and `defaultOperation?: string` to nodeMentions
- **Time**: 5 min

### **Task 1.2**: Add getOperationsFromNodeSchema() ✅
- **File**: `worker/src/services/ai/intent-extractor.ts` (new method)
- **Implementation**: Extract operations from `inputSchema.operation` (enum/oneOf)
- **Time**: 15 min

### **Task 1.3**: Add getDefaultOperationFromNode() ✅
- **File**: `worker/src/services/ai/intent-extractor.ts` (new method)
- **Implementation**: Get from `defaultConfig().operation` or first operation
- **Time**: 10 min

### **Task 1.4**: Enrich extractNodeMentions() ✅
- **File**: `worker/src/services/ai/intent-extractor.ts:139-266`
- **Change**: After extracting mentions, enrich each with operations
- **Time**: 10 min

**Phase 1 Result**: `SimpleIntent.nodeMentions` includes operations from schema

---

## 📋 PHASE 2: Enhance Variation Generation (70 min)

### **Task 2.1**: Add enrichNodeMentionsWithOperations() ✅
- **File**: `worker/src/services/ai/summarize-layer.ts` (new method)
- **Implementation**: Enrich nodeMentions with operations from registry
- **Time**: 20 min

### **Task 2.2**: Update buildClarificationPrompt() Signature ✅
- **File**: `worker/src/services/ai/summarize-layer.ts:1076`
- **Change**: Add parameter `nodeMentionsWithOperations`
- **Time**: 5 min

### **Task 2.3**: Add Operations Section to AI Prompt ✅
- **File**: `worker/src/services/ai/summarize-layer.ts:1076-1162`
- **Change**: Include operations section in AI prompt
- **Time**: 20 min

### **Task 2.4**: Update clarifyIntentAndGenerateVariations() ✅
- **File**: `worker/src/services/ai/summarize-layer.ts:268-479`
- **Change**: Enrich extractedNodeTypes with operations, pass to buildClarificationPrompt
- **Time**: 15 min

### **Task 2.5**: Update parseAIResponse() ✅
- **File**: `worker/src/services/ai/summarize-layer.ts:1546-1688`
- **Change**: Include operations in mandatoryNodesWithOperations
- **Time**: 10 min

**Phase 2 Result**: AI generates variations with exact operations from node schemas

---

## 📋 PHASE 3: Fix IntentAwarePlanner (45 min)

### **Task 3.1**: Skip Trigger Nodes ✅
- **File**: `worker/src/services/ai/intent-aware-planner.ts:215-265`
- **Change**: Check `nodeDef.category === 'trigger'` and skip
- **Time**: 10 min

### **Task 3.2**: Use Registry Category Directly ✅
- **File**: `worker/src/services/ai/intent-aware-planner.ts:228-236`
- **Change**: Replace capability-based with registry category mapping
- **Time**: 15 min

### **Task 3.3**: Use Operations from Enriched nodeMentions ✅
- **File**: `worker/src/services/ai/intent-aware-planner.ts:238-254`
- **Change**: Use `mention.operations` if available, validate against schema
- **Time**: 20 min

**Phase 3 Result**: Triggers skipped, registry category used, operations from schema

---

## 📋 PHASE 4: Fix DSLGenerator (55 min)

### **Task 4.1**: Add getOperationsFromNodeSchema() ✅
- **File**: `worker/src/services/ai/workflow-dsl.ts` (new method)
- **Implementation**: Same as IntentExtractor
- **Time**: 10 min

### **Task 4.2**: Add getDefaultOperationFromNode() ✅
- **File**: `worker/src/services/ai/workflow-dsl.ts` (new method)
- **Implementation**: Same as IntentExtractor
- **Time**: 10 min

### **Task 4.3**: Fix determineCategoryFromSchema() ✅
- **File**: `worker/src/services/ai/workflow-dsl.ts:1744-1785`
- **Change**: Registry category FIRST, throw error for triggers, validate operations
- **Time**: 25 min

### **Task 4.4**: Add Trigger Check in generateDSL() ✅
- **File**: `worker/src/services/ai/workflow-dsl.ts:536-571`
- **Change**: Check if node is trigger before categorization
- **Time**: 10 min

**Phase 4 Result**: Registry-first categorization, operation validation, triggers handled correctly

---

## 📋 PHASE 5: Type Safety & Testing (30 min)

### **Task 5.1**: Update TypeScript Interfaces ✅
- **Files**: Multiple
- **Change**: Ensure all types handle operations field
- **Time**: 15 min

### **Task 5.2**: Remove Operation Semantics Dependency ✅
- **File**: `worker/src/services/ai/workflow-dsl.ts:1752-1757`
- **Change**: Remove `getOperationSemantic()` calls
- **Time**: 5 min

### **Task 5.3**: Test Complete Flow ✅
- **Test Cases**: 5 scenarios
- **Time**: 30 min

**Phase 5 Result**: Type-safe, tested, no hardcoding

---

## 🔄 Data Flow

### **Before Implementation**:
```
Node Mention → Operation Semantic Derivation → DSL Category
(Complex, error-prone, ignores node individuality)
```

### **After Implementation**:
```
Node Mention → Operations from Schema → Registry Category → DSL Category
(Simple, direct, respects node individuality)
```

---

## ✅ Key Benefits

1. **Operations-First**: Operations available before variation generation
2. **Registry-First**: Category from registry, not operation semantics
3. **Direct Access**: Operations from node schema, no derivation
4. **No Hardcoding**: All from registry
5. **Simple Stages**: Clear flow, no complexity
6. **Enterprise-Grade**: Works for infinite nodes and users

---

## 🚨 Critical Points

1. **Triggers**: Must be skipped in planner, never categorized
2. **Operations**: Must be validated against node schema
3. **Registry Category**: Must be used FIRST, not as fallback
4. **Enrichment**: Must happen BEFORE variation generation

---

## 📝 Implementation Checklist

- [ ] Phase 1: Node mentions enriched with operations
- [ ] Phase 2: Variations generated with exact operations
- [ ] Phase 3: Triggers skipped, registry category used
- [ ] Phase 4: DSL uses registry category first
- [ ] Phase 5: Types updated, tests passing

---

## 🎯 Success Metrics

- ✅ No "trigger in dataSources" errors
- ✅ Variations include exact operations
- ✅ Operations validated against schema
- ✅ Registry category used directly
- ✅ No hardcoding in categorization
- ✅ Simple, clear flow

---

**Total Estimated Time**: ~3.5 hours
**Complexity**: Medium (well-defined stages)
**Risk**: Low (backward compatible, operations optional)
