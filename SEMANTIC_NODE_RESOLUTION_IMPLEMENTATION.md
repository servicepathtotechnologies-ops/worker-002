# Semantic Node Resolution Implementation Plan
## Detailed Technical Specification

---

## 🎯 Overview

This document provides the detailed implementation plan for replacing pattern-based node detection with semantic AI-powered resolution.

---

## 🏗️ Architecture Components

### Component 1: Semantic Intent Analyzer

**File**: `worker/src/services/ai/semantic-intent-analyzer.ts`

**Responsibilities**:
- Parse user prompt at word level
- Extract semantic meaning
- Identify actions, targets, categories
- Generate semantic keywords

**Interface**:
```typescript
interface SemanticIntent {
  // Extracted components
  actions: string[];           // ["post", "publish", "share"]
  targets: string[];           // ["linkedin", "twitter"]
  categories: string[];        // ["social_media", "output"]
  
  // Semantic understanding
  primaryIntent: string;       // "publish_content_to_social_media"
  semanticKeywords: string[];  // All relevant keywords
  
  // Context
  context: {
    domain: string;            // "social_media"
    operation: string;         // "write"
    platform?: string;         // "linkedin"
  };
}

class SemanticIntentAnalyzer {
  analyze(prompt: string): SemanticIntent;
  extractKeywords(prompt: string): string[];
  identifyCategory(prompt: string): string;
}
```

**Implementation Strategy**:
1. Use AI to understand semantic meaning
2. Extract action verbs (post, publish, send, create)
3. Identify target platforms/services
4. Categorize by domain (social_media, email, crm, etc.)
5. Generate semantic keywords from context

---

### Component 2: Node Metadata Enrichment

**File**: `worker/src/services/ai/node-metadata-enricher.ts`

**Responsibilities**:
- Collect ALL node metadata
- Structure for AI consumption
- Include keywords, capabilities, descriptions
- Format for semantic matching

**Interface**:
```typescript
interface NodeMetadata {
  type: string;
  keywords: string[];
  capabilities: string[];
  description: string;
  useCases: string[];
  category: string;
  semanticContext: string;  // Natural language description
}

class NodeMetadataEnricher {
  enrichAllNodes(): NodeMetadata[];
  getMetadataForType(type: string): NodeMetadata;
  formatForAI(nodes: NodeMetadata[]): string;  // Format for AI prompt
}
```

**Implementation Strategy**:
1. Extract metadata from NodeLibrary
2. Include all keywords, aliases, capabilities
3. Create natural language descriptions
4. Format as structured data for AI

---

### Component 3: AI-Powered Node Type Resolver

**File**: `worker/src/services/ai/semantic-node-resolver.ts`

**Responsibilities**:
- Match semantic intent to node types using AI
- Score confidence for each match
- Handle variations automatically
- Return canonical node type

**Interface**:
```typescript
interface NodeResolution {
  type: string;                    // Canonical type
  confidence: number;               // 0.0 - 1.0
  semanticMatch: {
    matchedKeywords: string[];
    matchedCapabilities: string[];
    reasoning: string;              // AI's reasoning
  };
  alternatives?: NodeResolution[];  // Other possible matches
}

class SemanticNodeResolver {
  resolve(
    intent: SemanticIntent,
    nodeMetadata: NodeMetadata[]
  ): NodeResolution;
  
  resolveWithContext(
    userInput: string,
    context?: any
  ): NodeResolution;
}
```

**AI Prompt Template**:
```
You are a node type resolver. Your job is to match user intent to available nodes.

Available Nodes:
{formatted_node_metadata}

User Intent:
{formatted_semantic_intent}

Task:
1. Understand what the user wants to do
2. Find the best matching node based on:
   - Semantic similarity (not exact string match)
   - Keyword relevance
   - Capability alignment
   - Use case match
3. Provide confidence score (0.0 - 1.0)
4. Explain your reasoning

Output Format (JSON):
{
  "type": "canonical_node_type",
  "confidence": 0.95,
  "matchedKeywords": ["keyword1", "keyword2"],
  "matchedCapabilities": ["capability1"],
  "reasoning": "User wants to publish to LinkedIn. Node 'linkedin' has keywords 'post', 'publish', 'linkedin' and capability 'send_post', which matches the intent."
}
```

**Implementation Strategy**:
1. Format node metadata for AI
2. Format semantic intent for AI
3. Call AI with structured prompt
4. Parse AI response
5. Validate resolved type exists
6. Return canonical type with metadata

---

### Component 4: Context-Aware Prompt Enhancement

**File**: `worker/src/services/ai/context-aware-prompt-enhancer.ts`

**Responsibilities**:
- Enhance prompts at every AI call stage
- Include node metadata context
- Preserve semantic context
- Format for each stage's needs

**Interface**:
```typescript
interface EnhancedPrompt {
  originalPrompt: string;
  semanticContext: SemanticIntent;
  availableNodes: NodeMetadata[];
  resolvedNodes: NodeResolution[];
  stage: 'planner' | 'dsl_generator' | 'validator';
}

class ContextAwarePromptEnhancer {
  enhanceForPlanner(prompt: string, context: any): EnhancedPrompt;
  enhanceForDSLGenerator(intent: StructuredIntent, context: any): EnhancedPrompt;
  enhanceForValidator(workflow: Workflow, context: any): EnhancedPrompt;
}
```

**Implementation Strategy**:
1. At each AI call stage, inject node metadata
2. Include semantic context from previous stages
3. Format according to stage requirements
4. Ensure keywords always available

---

### Component 5: Unified Node Type Format

**File**: `worker/src/core/types/unified-node-type.ts`

**Responsibilities**:
- Define canonical node type format
- Include semantic metadata
- Ensure consistency across stages

**Interface**:
```typescript
interface UnifiedNodeType {
  // Canonical type (always consistent)
  type: string;
  
  // Semantic resolution metadata
  resolution: {
    originalInput: string;
    confidence: number;
    matchedKeywords: string[];
    matchedCapabilities: string[];
    reasoning?: string;
  };
  
  // Validation
  isValid: boolean;
  validatedAt: Date;
}
```

**Implementation Strategy**:
1. All stages use UnifiedNodeType
2. Semantic metadata preserved
3. No type conversion between stages
4. Single source of truth

---

### Component 6: Self-Learning Resolution Cache

**File**: `worker/src/services/ai/resolution-learning-cache.ts`

**Responsibilities**:
- Cache successful resolutions
- Learn from user behavior
- Improve confidence over time
- Discover new patterns

**Interface**:
```typescript
interface ResolutionCacheEntry {
  input: string;              // User input
  resolvedType: string;        // Canonical type
  confidence: number;
  success: boolean;           // User accepted?
  timestamp: Date;
  usageCount: number;
}

class ResolutionLearningCache {
  get(input: string): ResolutionCacheEntry | null;
  store(entry: ResolutionCacheEntry): void;
  learn(input: string, resolvedType: string, success: boolean): void;
  getConfidence(input: string, resolvedType: string): number;
}
```

**Implementation Strategy**:
1. Cache all resolutions
2. Track user acceptance
3. Increase confidence for successful patterns
4. Use cache for similar inputs
5. Learn new variations automatically

---

## 🔄 Integration Points

### Integration 1: Summarizer Layer

**Current**: Enhances prompt with keywords
**Enhanced**: Also includes semantic intent analysis

```typescript
// In summarize-layer.ts
const semanticIntent = semanticIntentAnalyzer.analyze(userPrompt);
const enhancedPrompt = {
  ...originalPrompt,
  semanticIntent,
  nodeMetadata: nodeMetadataEnricher.enrichAllNodes()
};
```

---

### Integration 2: Planner Stage

**Current**: Receives original prompt
**Enhanced**: Receives prompt + semantic context + node metadata

```typescript
// In workflow-lifecycle-manager.ts
const enhancedPrompt = contextAwarePromptEnhancer.enhanceForPlanner(
  userPrompt,
  { semanticIntent, nodeMetadata }
);
```

---

### Integration 3: DSL Generator

**Current**: Uses pattern matching for node types
**Enhanced**: Uses semantic resolution

```typescript
// In workflow-dsl.ts
const resolvedType = semanticNodeResolver.resolve(
  semanticIntent,
  nodeMetadata
);
// Use resolvedType.type (canonical) instead of pattern matching
```

---

### Integration 4: Node Type Normalization

**Current**: Pattern-based normalization
**Enhanced**: Semantic resolution with fallback

```typescript
// In node-type-normalizer.ts
function normalizeNodeType(nodeType: string): string {
  // Try semantic resolution first
  const resolution = semanticNodeResolver.resolveWithContext(nodeType);
  if (resolution.confidence > 0.8) {
    return resolution.type;
  }
  
  // Fallback to pattern matching (backward compatibility)
  return patternBasedNormalize(nodeType);
}
```

---

### Integration 5: Final Validator

**Current**: Checks if type exists in NodeLibrary
**Enhanced**: Validates semantic match + existence

```typescript
// In final-workflow-validator.ts
function validateNodeType(node: WorkflowNode): ValidationResult {
  const unifiedType = node.data.unifiedType as UnifiedNodeType;
  
  // Check canonical type exists
  if (!nodeLibrary.hasType(unifiedType.type)) {
    return { valid: false, error: "Type not found" };
  }
  
  // Validate semantic match confidence
  if (unifiedType.resolution.confidence < 0.7) {
    return { valid: false, warning: "Low confidence match" };
  }
  
  return { valid: true };
}
```

---

## 📊 Data Flow

### Complete Flow Diagram

```
User Prompt
    ↓
[Semantic Intent Analyzer]
    ↓
Semantic Intent + Keywords
    ↓
[Node Metadata Enricher]
    ↓
All Node Metadata (keywords, capabilities, descriptions)
    ↓
[AI-Powered Node Resolver]
    ↓
Resolved Node Type (canonical) + Confidence
    ↓
[Unified Node Type Format]
    ↓
Canonical Type (consistent across all stages)
    ↓
[Context-Aware Prompt Enhancer]
    ↓
Enhanced Prompts (with context) for all AI stages
    ↓
[Self-Learning Cache]
    ↓
Improved confidence for future resolutions
```

---

## 🎯 Migration Strategy

### Phase 1: Parallel System (2 weeks)
- Implement semantic resolver alongside pattern matcher
- Use semantic resolver for new code paths
- Keep pattern matcher as fallback
- Compare results

### Phase 2: Gradual Migration (4 weeks)
- Migrate Summarizer layer
- Migrate Planner stage
- Migrate DSL Generator
- Migrate Validator

### Phase 3: Full Replacement (2 weeks)
- Remove pattern matching dependencies
- Use semantic resolver exclusively
- Update all integration points
- Comprehensive testing

### Phase 4: Optimization (2 weeks)
- Tune AI prompts
- Optimize caching
- Improve confidence scoring
- Performance optimization

---

## 📈 Success Metrics

### Accuracy
- **Target**: 99.5% correct node type resolution
- **Measurement**: Track resolution success rate
- **Improvement**: Self-learning increases accuracy over time

### Performance
- **Target**: < 100ms resolution time (with cache)
- **Measurement**: Average resolution latency
- **Optimization**: Caching + parallel processing

### User Experience
- **Target**: 0% "node type not found" errors
- **Measurement**: Error rate tracking
- **Goal**: Works with any natural language

### Scalability
- **Target**: Handle 1M+ unique user prompts
- **Measurement**: Unique input variations handled
- **Capability**: Infinite scalability through AI

---

## 🔒 Quality Assurance

### Testing Strategy
1. **Unit Tests**: Each component independently
2. **Integration Tests**: Component interactions
3. **End-to-End Tests**: Complete workflow generation
4. **Regression Tests**: Ensure no breaking changes
5. **Performance Tests**: Latency and throughput

### Validation Criteria
- ✅ All existing workflows still work
- ✅ New variations handled correctly
- ✅ Performance within targets
- ✅ No pattern matching dependencies
- ✅ Self-learning functioning

---

## 🚀 Next Steps

1. **Review Implementation Plan** - Validate approach
2. **Create Component Specifications** - Detailed APIs
3. **Design AI Prompts** - Optimize for accuracy
4. **Build Prototype** - Proof of concept
5. **Test with Real Data** - Validate effectiveness
6. **Plan Migration** - Minimize disruption
7. **Deploy Gradually** - Monitor and adjust

---

**This implementation plan provides a complete roadmap for transforming node detection into a world-class, semantic AI-powered system.**
