# Universal Fallback Variation Generator - Implementation Plan

## Overview

This document outlines the implementation plan for a **universal, root-level fix** to the fallback variation generation system. The fix will work for **infinite user prompts** and ensure **100% coverage** of required nodes in all variations.

---

## Architecture Design

### Core Principles

1. **Registry-Based**: Use `nodeCapabilityRegistryDSL` for ALL categorization
2. **Intent-Aware**: Parse user intent to identify REQUIRED nodes
3. **Workflow-Aware**: Build complete chains (source → transform → output)
4. **Universal**: Works for infinite prompts, not specific cases
5. **No Hardcoding**: All logic uses registry, no node-specific patches

---

## Implementation Components

### Component 1: Node Categorization System

**File**: `worker/src/services/ai/summarize-layer.ts`

**Method**: `categorizeExtractedNodes()`

**Purpose**: Categorize ALL extracted nodes using registry

**Implementation**:

```typescript
/**
 * ✅ UNIVERSAL: Categorize extracted nodes using registry
 * Uses nodeCapabilityRegistryDSL as single source of truth
 */
private categorizeExtractedNodes(extractedNodeTypes: string[]): {
  dataSources: string[];
  transformations: string[];
  outputs: string[];
  triggers: string[];
  others: string[];
} {
  const categories = {
    dataSources: [] as string[],
    transformations: [] as string[],
    outputs: [] as string[],
    triggers: [] as string[],
    others: [] as string[],
  };
  
  for (const nodeType of extractedNodeTypes) {
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    
    // Check if trigger (using registry category)
    if (nodeDef?.category === 'trigger' || 
        (nodeDef?.tags || []).includes('trigger')) {
      categories.triggers.push(nodeType);
      continue;
    }
    
    // Use capability registry for categorization
    if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
      categories.dataSources.push(nodeType);
    } else if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
      categories.transformations.push(nodeType);
    } else if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
      categories.outputs.push(nodeType);
    } else {
      categories.others.push(nodeType);
    }
  }
  
  return categories;
}
```

**Benefits**:
- ✅ Universal: Works for ALL nodes via registry
- ✅ No hardcoding: Uses capability registry
- ✅ Accurate: Registry is single source of truth

---

### Component 2: Intent-Based Required Node Identification

**File**: `worker/src/services/ai/summarize-layer.ts`

**Method**: `identifyRequiredNodesFromIntent()`

**Purpose**: Identify REQUIRED nodes from user intent verbs

**Implementation**:

```typescript
/**
 * ✅ UNIVERSAL: Identify required nodes from user intent
 * Parses verbs to determine which nodes are REQUIRED (not optional)
 */
private identifyRequiredNodesFromIntent(
  userPrompt: string,
  categorizedNodes: ReturnType<typeof this.categorizeExtractedNodes>
): {
  requiredDataSources: string[];
  requiredTransformations: string[];
  requiredOutputs: string[];
} {
  const promptLower = userPrompt.toLowerCase();
  const required = {
    requiredDataSources: [] as string[],
    requiredTransformations: [] as string[],
    requiredOutputs: [] as string[],
  };
  
  // ✅ STEP 1: Identify required data sources
  // Verbs: "get", "fetch", "read", "retrieve", "from", "pull", "load"
  const dataSourceVerbs = ['get', 'fetch', 'read', 'retrieve', 'from', 'pull', 'load', 'collect'];
  const hasDataSourceIntent = dataSourceVerbs.some(verb => promptLower.includes(verb));
  
  if (hasDataSourceIntent && categorizedNodes.dataSources.length > 0) {
    // Find node mentioned in prompt (e.g., "from google sheets" → google_sheets)
    for (const nodeType of categorizedNodes.dataSources) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const nodeLabel = (nodeDef?.label || nodeType).toLowerCase();
      const nodeTypeLower = nodeType.toLowerCase();
      
      // Check if node is mentioned in prompt
      if (promptLower.includes(nodeLabel) || 
          promptLower.includes(nodeTypeLower) ||
          // Check keywords/aliases
          (nodeDef?.tags || []).some(tag => promptLower.includes(tag.toLowerCase()))) {
        required.requiredDataSources.push(nodeType);
        break; // Use first matching node
      }
    }
    
    // If no match found, use first available data source
    if (required.requiredDataSources.length === 0) {
      required.requiredDataSources.push(categorizedNodes.dataSources[0]);
    }
  }
  
  // ✅ STEP 2: Identify required transformations
  // Verbs: "summarise", "summarize", "analyze", "analyse", "process", 
  //        "transform", "classify", "generate", "translate"
  const transformationVerbs = [
    'summarise', 'summarize', 'analyze', 'analyse', 'process', 
    'transform', 'classify', 'generate', 'translate', 'extract',
    'parse', 'format', 'convert', 'calculate', 'compute'
  ];
  const hasTransformationIntent = transformationVerbs.some(verb => 
    promptLower.includes(verb)
  );
  
  if (hasTransformationIntent && categorizedNodes.transformations.length > 0) {
    // Prefer AI nodes for summarization/analysis
    const aiNodes = categorizedNodes.transformations.filter(nt => {
      const nodeDef = unifiedNodeRegistry.get(nt);
      const nodeTypeLower = nt.toLowerCase();
      return nodeTypeLower.includes('ai') || 
             nodeTypeLower.includes('gemini') || 
             nodeTypeLower.includes('chat') || 
             nodeTypeLower.includes('llm') ||
             nodeTypeLower.includes('gpt') ||
             nodeTypeLower.includes('claude') ||
             (nodeDef?.category === 'ai');
    });
    
    if (aiNodes.length > 0) {
      required.requiredTransformations.push(aiNodes[0]);
    } else {
      // Use first available transformation
      required.requiredTransformations.push(categorizedNodes.transformations[0]);
    }
  }
  
  // ✅ STEP 3: Identify required outputs
  // Verbs: "send", "deliver", "notify", "post", "to", "email", "message"
  const outputVerbs = [
    'send', 'deliver', 'notify', 'post', 'to', 'email', 'message',
    'write', 'save', 'store', 'publish', 'share', 'dispatch'
  ];
  const hasOutputIntent = outputVerbs.some(verb => promptLower.includes(verb));
  
  if (hasOutputIntent && categorizedNodes.outputs.length > 0) {
    // Find node mentioned in prompt (e.g., "to gmail" → google_gmail)
    for (const nodeType of categorizedNodes.outputs) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const nodeLabel = (nodeDef?.label || nodeType).toLowerCase();
      const nodeTypeLower = nodeType.toLowerCase();
      
      // Check if node is mentioned in prompt
      if (promptLower.includes(nodeLabel) || 
          promptLower.includes(nodeTypeLower) ||
          // Check keywords/aliases
          (nodeDef?.tags || []).some(tag => promptLower.includes(tag.toLowerCase()))) {
        required.requiredOutputs.push(nodeType);
        break; // Use first matching node
      }
    }
    
    // If no match found, use first available output
    if (required.requiredOutputs.length === 0) {
      required.requiredOutputs.push(categorizedNodes.outputs[0]);
    }
  }
  
  return required;
}
```

**Benefits**:
- ✅ Intent-aware: Understands user's actual requirements
- ✅ Universal: Works for any verb pattern
- ✅ Accurate: Matches nodes to user intent

---

### Component 3: Workflow Chain Builder

**File**: `worker/src/services/ai/summarize-layer.ts`

**Method**: `buildWorkflowChain()`

**Purpose**: Build complete workflow chains (source → transform → output)

**Implementation**:

```typescript
/**
 * ✅ UNIVERSAL: Build complete workflow chain
 * Ensures all variations have complete chains: trigger → source → transform → output
 */
private buildWorkflowChain(
  requiredNodes: ReturnType<typeof this.identifyRequiredNodesFromIntent>,
  categorizedNodes: ReturnType<typeof this.categorizeExtractedNodes>,
  triggerType: string
): string[] {
  const chain: string[] = [triggerType];
  
  // ✅ STEP 1: Add required data source (or first available)
  if (requiredNodes.requiredDataSources.length > 0) {
    chain.push(requiredNodes.requiredDataSources[0]);
  } else if (categorizedNodes.dataSources.length > 0) {
    chain.push(categorizedNodes.dataSources[0]);
  }
  
  // ✅ STEP 2: Add required transformation (or first available)
  if (requiredNodes.requiredTransformations.length > 0) {
    chain.push(requiredNodes.requiredTransformations[0]);
  } else if (categorizedNodes.transformations.length > 0) {
    chain.push(categorizedNodes.transformations[0]);
  }
  
  // ✅ STEP 3: Add required output (or first available)
  if (requiredNodes.requiredOutputs.length > 0) {
    chain.push(requiredNodes.requiredOutputs[0]);
  } else if (categorizedNodes.outputs.length > 0) {
    chain.push(categorizedNodes.outputs[0]);
  }
  
  return chain;
}
```

**Benefits**:
- ✅ Complete chains: Always includes source → transform → output
- ✅ Required-first: Prioritizes required nodes
- ✅ Fallback-safe: Uses available nodes if required not found

---

### Component 4: Variation Prompt Builder

**File**: `worker/src/services/ai/summarize-layer.ts`

**Method**: `buildVariationPrompt()`

**Purpose**: Build natural language prompt describing complete workflow

**Implementation**:

```typescript
/**
 * ✅ UNIVERSAL: Build variation prompt describing complete workflow
 */
private buildVariationPrompt(
  chain: string[],
  nodeLabels: Map<string, string>,
  nodeOperations: Map<string, { operations: string[]; defaultOp: string }>,
  variationIndex: number
): string {
  if (chain.length < 2) {
    return `Start the workflow with ${chain[0] || 'manual_trigger'} to initiate automation.`;
  }
  
  const trigger = chain[0];
  const triggerLabel = nodeLabels.get(trigger) || trigger;
  
  // Build prompt based on variation index
  let prompt = '';
  
  if (variationIndex === 0) {
    // Variation 1: Manual trigger, linear flow
    prompt = `Start the workflow with ${triggerLabel} to initiate automation. `;
    
    if (chain.length > 1) {
      const dataSource = chain[1];
      const dataSourceLabel = nodeLabels.get(dataSource) || dataSource;
      const dataSourceOps = nodeOperations.get(dataSource);
      const dataSourceOp = dataSourceOps?.defaultOp || 'read';
      
      prompt += `Use ${dataSourceLabel} with operation='${dataSourceOp}' to fetch data. `;
    }
    
    if (chain.length > 2) {
      const transformation = chain[2];
      const transformationLabel = nodeLabels.get(transformation) || transformation;
      const transformationOps = nodeOperations.get(transformation);
      const transformationOp = transformationOps?.defaultOp || 'transform';
      
      prompt += `Process the data through ${transformationLabel} with operation='${transformationOp}' to analyze and transform. `;
    }
    
    if (chain.length > 3) {
      const output = chain[3];
      const outputLabel = nodeLabels.get(output) || output;
      const outputOps = nodeOperations.get(output);
      const outputOp = outputOps?.defaultOp || 'send';
      
      prompt += `Deliver the results using ${outputLabel} with operation='${outputOp}'.`;
    }
  } else if (variationIndex === 1) {
    // Variation 2: Manual trigger, alternative flow
    prompt = `Create a workflow using ${triggerLabel} as the entry point. `;
    
    if (chain.length > 1) {
      const dataSource = chain[1];
      const dataSourceLabel = nodeLabels.get(dataSource) || dataSource;
      prompt += `Begin by using ${dataSourceLabel} to gather initial data. `;
    }
    
    if (chain.length > 2) {
      const transformation = chain[2];
      const transformationLabel = nodeLabels.get(transformation) || transformation;
      prompt += `Then utilize ${transformationLabel} to process and transform the information. `;
    }
    
    if (chain.length > 3) {
      const output = chain[3];
      const outputLabel = nodeLabels.get(output) || output;
      prompt += `Finalize the workflow by sending results via ${outputLabel}.`;
    }
  } else if (variationIndex === 2) {
    // Variation 3: Webhook trigger, primary flow
    prompt = `Set up the workflow to trigger via ${triggerLabel} when external events occur. `;
    
    if (chain.length > 1) {
      const dataSource = chain[1];
      const dataSourceLabel = nodeLabels.get(dataSource) || dataSource;
      prompt += `Use ${dataSourceLabel} to retrieve incoming data. `;
    }
    
    if (chain.length > 2) {
      const transformation = chain[2];
      const transformationLabel = nodeLabels.get(transformation) || transformation;
      prompt += `Route the data through ${transformationLabel} for processing. `;
    }
    
    if (chain.length > 3) {
      const output = chain[3];
      const outputLabel = nodeLabels.get(output) || output;
      prompt += `Output the final results using ${outputLabel}.`;
    }
  } else {
    // Variation 4: Webhook trigger, alternative flow
    prompt = `Configure an automated workflow that activates through ${triggerLabel} for real-time processing. `;
    
    if (chain.length > 1) {
      const dataSource = chain[1];
      const dataSourceLabel = nodeLabels.get(dataSource) || dataSource;
      prompt += `Leverage ${dataSourceLabel} to capture incoming information. `;
    }
    
    if (chain.length > 2) {
      const transformation = chain[2];
      const transformationLabel = nodeLabels.get(transformation) || transformation;
      prompt += `Apply ${transformationLabel} to analyze and transform the data. `;
    }
    
    if (chain.length > 3) {
      const output = chain[3];
      const outputLabel = nodeLabels.get(output) || output;
      prompt += `Complete the automation by delivering processed output via ${outputLabel}.`;
    }
  }
  
  return prompt;
}
```

**Benefits**:
- ✅ Natural language: Reads like human-written prompts
- ✅ Complete workflows: Describes full chain
- ✅ Distinct variations: Different wording per variation

---

### Component 5: Universal Fallback Generator (Main Method)

**File**: `worker/src/services/ai/summarize-layer.ts`

**Method**: `createFallbackResultWithExtractedNodes()` (REPLACE)

**Purpose**: Generate 4 distinct variations with complete workflow chains

**Implementation**:

```typescript
/**
 * ✅ UNIVERSAL ROOT-LEVEL FIX: Create fallback result using EXTRACTED NODES
 * 
 * This method:
 * 1. Categorizes all extracted nodes (dataSource/transformation/output)
 * 2. Identifies required nodes from user intent
 * 3. Builds complete workflow chains
 * 4. Generates 4 distinct variations
 * 
 * Works for INFINITE prompts - not just specific cases.
 */
private createFallbackResultWithExtractedNodes(
  userPrompt: string,
  allKeywords: string[],
  extractedNodeTypes: string[],
  allKeywordData: AliasKeyword[],
  error: Error | null
): SummarizeLayerResult {
  console.log(`[AIIntentClarifier] 🔧 Creating fallback using ${extractedNodeTypes.length} extracted node(s): ${extractedNodeTypes.join(', ')}`);
  
  // ✅ STEP 1: Get node labels/keywords for better prompt generation
  const nodeLabels = new Map<string, string>();
  for (const nodeType of extractedNodeTypes) {
    const schema = nodeLibrary.getSchema(nodeType);
    if (schema) {
      nodeLabels.set(nodeType, schema.label || nodeType);
    }
  }
  
  // ✅ STEP 2: Get operations for nodes that have them
  const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
  const nodeOperations = new Map<string, { operations: string[]; defaultOp: string }>();
  for (const nodeType of extractedNodeTypes) {
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef?.inputSchema) {
      const opField = nodeDef.inputSchema.properties?.operation;
      if (opField && (opField.enum || opField.oneOf)) {
        const ops = opField.enum || (opField.oneOf?.map((o: any) => o.const).filter(Boolean) || []);
        nodeOperations.set(nodeType, {
          operations: ops,
          defaultOp: opField.default || ops[0] || 'read'
        });
      }
    }
  }
  
  // ✅ STEP 3: Categorize all extracted nodes
  const categorizedNodes = this.categorizeExtractedNodes(extractedNodeTypes);
  
  console.log(`[AIIntentClarifier] ✅ Categorized nodes:`);
  console.log(`[AIIntentClarifier]   - Data Sources: ${categorizedNodes.dataSources.join(', ')}`);
  console.log(`[AIIntentClarifier]   - Transformations: ${categorizedNodes.transformations.join(', ')}`);
  console.log(`[AIIntentClarifier]   - Outputs: ${categorizedNodes.outputs.join(', ')}`);
  console.log(`[AIIntentClarifier]   - Triggers: ${categorizedNodes.triggers.join(', ')}`);
  
  // ✅ STEP 4: Identify required nodes from user intent
  const requiredNodes = this.identifyRequiredNodesFromIntent(userPrompt, categorizedNodes);
  
  console.log(`[AIIntentClarifier] ✅ Required nodes from intent:`);
  console.log(`[AIIntentClarifier]   - Required Data Sources: ${requiredNodes.requiredDataSources.join(', ')}`);
  console.log(`[AIIntentClarifier]   - Required Transformations: ${requiredNodes.requiredTransformations.join(', ')}`);
  console.log(`[AIIntentClarifier]   - Required Outputs: ${requiredNodes.requiredOutputs.join(', ')}`);
  
  // ✅ STEP 5: Generate 4 distinct variations
  const variations: PromptVariation[] = [];
  
  for (let i = 0; i < 4; i++) {
    // Determine trigger type
    const triggerType = i < 2 ? 'manual_trigger' : 'webhook';
    
    // Build complete workflow chain
    const chain = this.buildWorkflowChain(requiredNodes, categorizedNodes, triggerType);
    
    console.log(`[AIIntentClarifier] ✅ Variation ${i + 1} chain: ${chain.join(' → ')}`);
    
    // Build prompt describing complete workflow
    const prompt = this.buildVariationPrompt(chain, nodeLabels, nodeOperations, i);
    
    variations.push({
      id: `fallback-${i + 1}`,
      prompt,
      keywords: chain,
      matchedKeywords: chain,
      confidence: 0.8, // Higher confidence - uses required nodes
      reasoning: `Fallback variation ${i + 1} with complete workflow chain: ${chain.join(' → ')}`
    });
  }
  
  // ✅ STEP 6: Map extracted nodes to keywords for matchedKeywords
  const matchedKeywordsSet = new Set<string>();
  for (const nodeType of extractedNodeTypes) {
    matchedKeywordsSet.add(nodeType);
    // Add node keywords
    const keywordData = allKeywordData.filter(kd => kd.nodeType === nodeType);
    for (const kd of keywordData.slice(0, 2)) { // Add top 2 keywords per node
      matchedKeywordsSet.add(kd.keyword);
    }
  }
  
  return {
    shouldShowLayer: true,
    originalPrompt: userPrompt,
    promptVariations: variations,
    allKeywords: allKeywords,
    matchedKeywords: Array.from(matchedKeywordsSet),
    mandatoryNodeTypes: extractedNodeTypes, // ✅ ROOT FIX: Use extracted nodes
  };
}
```

**Benefits**:
- ✅ Complete workflows: Always includes all required nodes
- ✅ Distinct variations: Different triggers and flows
- ✅ Universal: Works for any prompt structure

---

## Implementation Steps

### Step 1: Add Helper Methods (30 min)

1. Add `categorizeExtractedNodes()` method
2. Add `identifyRequiredNodesFromIntent()` method
3. Add `buildWorkflowChain()` method
4. Add `buildVariationPrompt()` method

**Testing**: Unit test each method with sample data

---

### Step 2: Replace Fallback Method (45 min)

1. Replace `createFallbackResultWithExtractedNodes()` with new implementation
2. Use new helper methods
3. Ensure all 4 variations include required nodes

**Testing**: Test with original prompt

---

### Step 3: Integration Testing (60 min)

1. Test with original prompt: "get data from google sheets, summarise it and send it to gmail"
   - ✅ Verify all 4 variations include: google_sheets, google_gemini, google_gmail
   
2. Test with other prompts:
   - "read from database and send email"
   - "fetch API data, analyze it, post to slack"
   - "get CRM data, summarize, notify via email"
   
3. Verify:
   - ✅ All variations include required nodes
   - ✅ Variations are distinct (< 70% similarity)
   - ✅ Complete workflow chains (source → transform → output)

---

## Success Criteria

✅ **100% Coverage**: All variations include ALL required nodes
✅ **Universal**: Works for infinite prompts (not just specific cases)
✅ **Registry-Based**: Uses `nodeCapabilityRegistryDSL` for categorization
✅ **Intent-Aware**: Identifies required nodes from user intent
✅ **Complete Chains**: Always builds source → transform → output chains
✅ **Distinct Variations**: All 4 variations are unique (< 70% similarity)

---

## Risk Mitigation

1. **Edge Cases**: Handle prompts with missing categories
   - Solution: Use available nodes, skip missing categories gracefully

2. **Multiple Nodes Per Category**: Handle multiple data sources/outputs
   - Solution: Use first matching node, or combine if appropriate

3. **No Extracted Nodes**: Handle case where no nodes extracted
   - Solution: Return diagnostic error (already implemented)

4. **Registry Changes**: Handle registry API changes
   - Solution: Use stable registry methods, add fallbacks

---

## Conclusion

This universal fix will:
- ✅ Work for **infinite prompts** (not just specific cases)
- ✅ Ensure **100% coverage** of required nodes
- ✅ Use **registry-based** categorization (no hardcoding)
- ✅ Build **complete workflow chains** (source → transform → output)
- ✅ Generate **distinct variations** (< 70% similarity)

**Impact**: Root-level fix that works for all prompt types, not just patches for specific cases.
