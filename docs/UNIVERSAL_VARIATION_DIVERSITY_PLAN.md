# Universal Variation Diversity - Root-Level Implementation Plan

## 🎯 Goal
**Create a 100% registry-driven, zero-hardcoding system for variation node diversity that works for infinite workflows.**

---

## 📋 Architecture Principles

### Core Requirements:
1. ✅ **Zero Hardcoding**: All node selection from registry
2. ✅ **Universal Algorithm**: Works for any node type automatically
3. ✅ **Infinite Scalability**: New nodes work without code changes
4. ✅ **Registry-Driven**: Single source of truth (unified-node-registry)
5. ✅ **Semantic Matching**: Uses node metadata (category, tags, description, capabilities)

---

## 🏗️ Implementation Architecture

### Phase 1: Universal Node Categorizer Service

**Purpose**: Dynamically categorize nodes by their role (helper, processing, style) using registry metadata.

**Location**: `worker/src/core/utils/universal-variation-node-categorizer.ts`

**How it works**:
```typescript
class UniversalVariationNodeCategorizer {
  /**
   * Categorize nodes by semantic analysis of registry metadata
   * NO hardcoded lists - uses node.category, tags, description, capabilities
   */
  
  getHelperNodes(): string[] {
    // Query registry for nodes that match "helper" semantics:
    // - category === 'utility' || 'logic'
    // - tags include: 'helper', 'utility', 'cache', 'delay', 'wait', 'split'
    // - description contains: 'delay', 'wait', 'cache', 'split', 'batch'
    // - NOT in required nodes list
    // - NOT a trigger, data source, or output node
  }
  
  getProcessingNodes(): string[] {
    // Query registry for nodes that match "processing" semantics:
    // - category === 'transformation' || 'ai'
    // - tags include: 'transform', 'process', 'merge', 'aggregate', 'filter'
    // - description contains: 'transform', 'process', 'merge', 'aggregate', 'filter'
    // - NOT in required nodes list
  }
  
  getStyleNodes(): string[] {
    // Query registry for nodes that match "style" semantics:
    // - category === 'trigger' AND (type includes 'schedule' || 'interval' || 'queue')
    // - tags include: 'schedule', 'queue', 'batch', 'event'
    // - description contains: 'schedule', 'queue', 'batch', 'periodic'
    // - NOT in required nodes list
  }
}
```

**Key Features**:
- Uses `unifiedNodeRegistry.getAllTypes()` to get all nodes
- Filters by `nodeDef.category`, `nodeDef.tags`, `nodeDef.description`
- Semantic keyword matching (not exact string matching)
- Excludes required nodes automatically
- Returns ranked list (most relevant first)

---

### Phase 2: Dynamic Node List Builder

**Purpose**: Build variation-specific node lists dynamically from registry.

**Location**: `worker/src/services/ai/summarize-layer.ts` (new method)

**How it works**:
```typescript
private buildDynamicNodeListsForVariations(
  extractedNodeTypes: string[]
): {
  helperNodes: string[];
  processingNodes: string[];
  styleNodes: string[];
} {
  const categorizer = new UniversalVariationNodeCategorizer();
  
  // Get all candidate nodes from registry
  const allHelperCandidates = categorizer.getHelperNodes();
  const allProcessingCandidates = categorizer.getProcessingNodes();
  const allStyleCandidates = categorizer.getStyleNodes();
  
  // Filter out required nodes (don't suggest nodes already in workflow)
  const helperNodes = allHelperCandidates
    .filter(node => !extractedNodeTypes.includes(node))
    .slice(0, 10); // Limit to top 10 for AI prompt
  
  const processingNodes = allProcessingCandidates
    .filter(node => !extractedNodeTypes.includes(node))
    .slice(0, 10);
  
  const styleNodes = allStyleCandidates
    .filter(node => !extractedNodeTypes.includes(node))
    .slice(0, 10);
  
  return { helperNodes, processingNodes, styleNodes };
}
```

---

### Phase 3: Update Variation Instructions

**Purpose**: Replace hardcoded node lists with dynamic registry-driven lists.

**Location**: `worker/src/services/ai/summarize-layer.ts` (buildClarificationPrompt method)

**Changes**:
```typescript
// BEFORE (hardcoded):
* ADD 1-2 helper nodes from this list: delay, wait, cache_get, data_validation, split_in_batches

// AFTER (registry-driven):
* ADD 1-2 helper nodes from available helper nodes: ${helperNodes.join(', ')}
* These nodes are automatically selected from registry based on their capabilities
* Choose DIFFERENT helper nodes than Variations 3 and 4
```

---

### Phase 4: Enhanced Node Diversity Validation

**Purpose**: Validate that variations use different nodes from registry-driven lists.

**Location**: `worker/src/services/ai/summarize-layer.ts` (validateVariationUniqueness method)

**Enhancement**:
```typescript
// Check that extra nodes are from different categories
// Variation 2 should use helper nodes
// Variation 3 should use processing nodes  
// Variation 4 should use style nodes
// If overlap detected, reject and retry
```

---

## 🔧 Implementation Steps

### Step 1: Create UniversalVariationNodeCategorizer

**File**: `worker/src/core/utils/universal-variation-node-categorizer.ts`

**Implementation**:
```typescript
import { unifiedNodeRegistry } from '../registry/unified-node-registry';

export class UniversalVariationNodeCategorizer {
  private helperKeywords = ['delay', 'wait', 'cache', 'split', 'batch', 'validation', 'utility'];
  private processingKeywords = ['transform', 'process', 'merge', 'aggregate', 'filter', 'map', 'parse'];
  private styleKeywords = ['schedule', 'queue', 'interval', 'event', 'trigger', 'periodic', 'batch'];
  
  /**
   * Get helper nodes from registry using semantic matching
   */
  getHelperNodes(excludeNodes: string[] = []): string[] {
    const allNodes = unifiedNodeRegistry.getAllTypes();
    const helperNodes: Array<{ nodeType: string; score: number }> = [];
    
    for (const nodeType of allNodes) {
      if (excludeNodes.includes(nodeType)) continue;
      
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Skip triggers, data sources, outputs (not helpers)
      if (nodeDef.isTrigger) continue;
      if (nodeDef.category === 'data' || nodeDef.category === 'communication') continue;
      
      let score = 0;
      const typeLower = nodeType.toLowerCase();
      const category = (nodeDef.category || '').toLowerCase();
      const description = (nodeDef.description || '').toLowerCase();
      const tags = (nodeDef.tags || []).map((t: string) => t.toLowerCase());
      
      // Category matching
      if (category === 'utility' || category === 'logic') score += 3;
      
      // Type name matching
      for (const keyword of this.helperKeywords) {
        if (typeLower.includes(keyword)) score += 2;
      }
      
      // Description matching
      for (const keyword of this.helperKeywords) {
        if (description.includes(keyword)) score += 1;
      }
      
      // Tags matching
      for (const tag of tags) {
        for (const keyword of this.helperKeywords) {
          if (tag.includes(keyword)) score += 1.5;
        }
      }
      
      if (score > 0) {
        helperNodes.push({ nodeType, score });
      }
    }
    
    // Sort by score (highest first) and return node types
    return helperNodes
      .sort((a, b) => b.score - a.score)
      .map(item => item.nodeType);
  }
  
  /**
   * Get processing nodes from registry using semantic matching
   */
  getProcessingNodes(excludeNodes: string[] = []): string[] {
    // Similar implementation for processing nodes
  }
  
  /**
   * Get style nodes from registry using semantic matching
   */
  getStyleNodes(excludeNodes: string[] = []): string[] {
    // Similar implementation for style nodes
  }
}
```

---

### Step 2: Integrate into SummarizeLayer

**File**: `worker/src/services/ai/summarize-layer.ts`

**Changes**:
1. Import categorizer
2. Call `buildDynamicNodeListsForVariations()` in `buildClarificationPrompt()`
3. Replace hardcoded lists with dynamic lists in prompt
4. Update validation to check node categories

---

### Step 3: Update Validation Logic

**Enhancement**: Check that variations use nodes from correct categories:
- Variation 2: Should use helper nodes
- Variation 3: Should use processing nodes
- Variation 4: Should use style nodes

---

## ✅ Benefits

1. **Zero Hardcoding**: All node selection from registry
2. **Automatic Updates**: New nodes automatically appear in lists
3. **Semantic Matching**: Uses node metadata, not hardcoded lists
4. **Infinite Scalability**: Works for any number of nodes
5. **Maintainable**: Single source of truth (registry)
6. **Flexible**: Adapts to new node types automatically

---

## 🎯 Testing Strategy

1. **Unit Tests**: Test categorizer with various node types
2. **Integration Tests**: Test variation generation with dynamic lists
3. **Edge Cases**: Test with new node types, missing metadata
4. **Performance**: Ensure categorizer is fast (cache results)

---

## 📊 Migration Path

1. **Phase 1**: Create categorizer (no breaking changes)
2. **Phase 2**: Integrate into summarize-layer (backward compatible)
3. **Phase 3**: Remove hardcoded lists (cleanup)
4. **Phase 4**: Add validation enhancements

---

## 🚀 Success Criteria

- ✅ Zero hardcoded node lists
- ✅ All node selection from registry
- ✅ Works for new nodes automatically
- ✅ Variations have different node combinations
- ✅ Node diversity validation works
- ✅ Performance is acceptable (<100ms for categorization)
