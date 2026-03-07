# API Specification for Semantic Node Resolution
## Interface Contracts and Integration Points

---

## 🎯 Overview

This document defines the API contracts for all components in the semantic node resolution system.

---

## 📋 Core APIs

### API 1: Semantic Intent Analyzer

**File**: `worker/src/services/ai/semantic-intent-analyzer.ts`

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
  /**
   * Analyze user prompt and extract semantic intent
   * 
   * @param prompt - User's natural language prompt
   * @returns Semantic intent with actions, targets, categories, and keywords
   */
  analyze(prompt: string): SemanticIntent;
  
  /**
   * Extract semantic keywords from prompt
   * 
   * @param prompt - User's natural language prompt
   * @returns Array of semantic keywords
   */
  extractKeywords(prompt: string): string[];
  
  /**
   * Identify category from prompt
   * 
   * @param prompt - User's natural language prompt
   * @returns Category string (e.g., "social_media", "communication")
   */
  identifyCategory(prompt: string): string;
}
```

**Usage Example**:
```typescript
const analyzer = new SemanticIntentAnalyzer();
const intent = analyzer.analyze('post on linkedin');

console.log(intent.actions);      // ["post", "publish"]
console.log(intent.targets);      // ["linkedin"]
console.log(intent.categories);   // ["social_media"]
console.log(intent.semanticKeywords); // ["post", "publish", "linkedin", "social"]
```

---

### API 2: Node Metadata Enricher

**File**: `worker/src/services/ai/node-metadata-enricher.ts`

**Interface**:
```typescript
interface NodeMetadata {
  type: string;                    // Canonical node type
  keywords: string[];              // All keywords/aliases
  capabilities: string[];          // What node can do
  description: string;             // Natural language description
  useCases: string[];              // Common use cases
  category: string;                // Node category
  semanticContext: string;         // Natural language context
}

class NodeMetadataEnricher {
  /**
   * Enrich all nodes with complete metadata
   * 
   * @returns Array of enriched node metadata
   */
  enrichAllNodes(): NodeMetadata[];
  
  /**
   * Get metadata for specific node type
   * 
   * @param nodeType - Canonical node type
   * @returns Node metadata or null if not found
   */
  getMetadataForType(nodeType: string): NodeMetadata | null;
  
  /**
   * Format node metadata for AI consumption
   * 
   * @param nodes - Array of node metadata
   * @returns Formatted string for AI prompts
   */
  formatForAI(nodes: NodeMetadata[]): string;
}
```

**Usage Example**:
```typescript
const enricher = new NodeMetadataEnricher();
const allMetadata = enricher.enrichAllNodes();
const linkedinMetadata = enricher.getMetadataForType('linkedin');
const formatted = enricher.formatForAI(allMetadata);
```

---

### API 3: AI-Powered Node Resolver

**File**: `worker/src/services/ai/semantic-node-resolver.ts`

**Interface**:
```typescript
interface NodeResolution {
  type: string;                    // Canonical node type
  confidence: number;               // 0.0 - 1.0
  semanticMatch: {
    matchedKeywords: string[];      // Keywords that matched
    matchedCapabilities: string[];  // Capabilities that matched
    reasoning: string;              // AI's reasoning
  };
  alternatives?: NodeResolution[];  // Other possible matches
}

class SemanticNodeResolver {
  /**
   * Resolve semantic intent to node type
   * 
   * @param intent - Semantic intent from analyzer
   * @param nodeMetadata - All available node metadata
   * @returns Node resolution with confidence
   */
  resolve(
    intent: SemanticIntent,
    nodeMetadata: NodeMetadata[]
  ): Promise<NodeResolution>;
  
  /**
   * Resolve user input directly with context
   * 
   * @param userInput - User's natural language input
   * @param context - Optional context from previous stages
   * @returns Node resolution with confidence
   */
  resolveWithContext(
    userInput: string,
    context?: any
  ): Promise<NodeResolution>;
  
  /**
   * Batch resolve multiple inputs
   * 
   * @param inputs - Array of user inputs
   * @returns Array of resolutions
   */
  resolveBatch(inputs: string[]): Promise<NodeResolution[]>;
}
```

**Usage Example**:
```typescript
const resolver = new SemanticNodeResolver();
const intent = analyzer.analyze('post on linkedin');
const metadata = enricher.enrichAllNodes();

const resolution = await resolver.resolve(intent, metadata);
console.log(resolution.type);        // "linkedin"
console.log(resolution.confidence);  // 0.95
console.log(resolution.semanticMatch.reasoning);
```

---

### API 4: Context-Aware Prompt Enhancer

**File**: `worker/src/services/ai/context-aware-prompt-enhancer.ts`

**Interface**:
```typescript
interface EnhancedPrompt {
  originalPrompt: string;
  semanticContext: SemanticIntent;
  availableNodes: NodeMetadata[];
  resolvedNodes: NodeResolution[];
  stage: 'planner' | 'dsl_generator' | 'validator';
  formattedPrompt: string;          // Ready for AI
}

class ContextAwarePromptEnhancer {
  /**
   * Enhance prompt for planner stage
   * 
   * @param prompt - Original user prompt
   * @param context - Semantic context and metadata
   * @returns Enhanced prompt with all context
   */
  enhanceForPlanner(
    prompt: string,
    context: {
      semanticIntent?: SemanticIntent;
      nodeMetadata?: NodeMetadata[];
      resolvedNodes?: NodeResolution[];
    }
  ): EnhancedPrompt;
  
  /**
   * Enhance prompt for DSL generator stage
   * 
   * @param intent - Structured intent
   * @param context - Semantic context and metadata
   * @returns Enhanced prompt with all context
   */
  enhanceForDSLGenerator(
    intent: StructuredIntent,
    context: {
      semanticIntent?: SemanticIntent;
      nodeMetadata?: NodeMetadata[];
      resolvedNodes?: NodeResolution[];
    }
  ): EnhancedPrompt;
  
  /**
   * Enhance prompt for validator stage
   * 
   * @param workflow - Generated workflow
   * @param context - Semantic context and metadata
   * @returns Enhanced prompt with all context
   */
  enhanceForValidator(
    workflow: Workflow,
    context: {
      semanticIntent?: SemanticIntent;
      nodeMetadata?: NodeMetadata[];
      resolvedNodes?: NodeResolution[];
    }
  ): EnhancedPrompt;
}
```

**Usage Example**:
```typescript
const enhancer = new ContextAwarePromptEnhancer();
const enhanced = enhancer.enhanceForPlanner(userPrompt, {
  semanticIntent: intent,
  nodeMetadata: metadata,
  resolvedNodes: [resolution]
});

// Use enhanced.formattedPrompt for AI call
```

---

### API 5: Unified Node Type Format

**File**: `worker/src/core/types/unified-node-type.ts`

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

/**
 * Convert node resolution to unified format
 */
function toUnifiedType(resolution: NodeResolution): UnifiedNodeType;

/**
 * Extract canonical type from unified format
 */
function getCanonicalType(unified: UnifiedNodeType): string;

/**
 * Check if unified type is valid
 */
function isValid(unified: UnifiedNodeType): boolean;
```

**Usage Example**:
```typescript
const resolution = await resolver.resolve(intent, metadata);
const unified = toUnifiedType(resolution);

console.log(unified.type);              // "linkedin"
console.log(unified.resolution.confidence); // 0.95
console.log(isValid(unified));          // true
```

---

### API 6: Unified Node Categorizer

**File**: `worker/src/services/ai/unified-node-categorizer.ts`

**Interface**:
```typescript
interface CategorizationResult {
  category: 'dataSource' | 'transformation' | 'output';
  confidence: number;
  reasoning: string;
}

class UnifiedNodeCategorizer {
  /**
   * Categorize node type based on capabilities
   * 
   * @param nodeType - Canonical node type
   * @returns Categorization result
   */
  categorize(nodeType: string): CategorizationResult;
  
  /**
   * Check if node is output type
   * 
   * @param nodeType - Canonical node type
   * @returns True if output node
   */
  isOutput(nodeType: string): boolean;
  
  /**
   * Check if node is data source type
   * 
   * @param nodeType - Canonical node type
   * @returns True if data source node
   */
  isDataSource(nodeType: string): boolean;
  
  /**
   * Check if node is transformation type
   * 
   * @param nodeType - Canonical node type
   * @returns True if transformation node
   */
  isTransformation(nodeType: string): boolean;
}
```

**Usage Example**:
```typescript
const categorizer = new UnifiedNodeCategorizer();
const result = categorizer.categorize('linkedin');

console.log(result.category);    // "output"
console.log(result.confidence);  // 1.0
console.log(categorizer.isOutput('linkedin')); // true
```

---

### API 7: Self-Learning Cache

**File**: `worker/src/services/ai/resolution-learning-cache.ts`

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
  /**
   * Get cached resolution
   * 
   * @param input - User input
   * @returns Cached entry or null
   */
  get(input: string): ResolutionCacheEntry | null;
  
  /**
   * Store resolution in cache
   * 
   * @param entry - Resolution cache entry
   */
  store(entry: ResolutionCacheEntry): void;
  
  /**
   * Learn from successful resolution
   * 
   * @param input - User input
   * @param resolvedType - Resolved node type
   * @param success - Whether user accepted
   */
  learn(
    input: string,
    resolvedType: string,
    success: boolean
  ): void;
  
  /**
   * Get confidence for input-type pair
   * 
   * @param input - User input
   * @param resolvedType - Node type
   * @returns Confidence score (0.0 - 1.0)
   */
  getConfidence(input: string, resolvedType: string): number;
}
```

**Usage Example**:
```typescript
const cache = new ResolutionLearningCache();

// Check cache first
const cached = cache.get('post on linkedin');
if (cached && cached.confidence > 0.8) {
  return cached.resolvedType;
}

// Resolve and cache
const resolution = await resolver.resolve(intent, metadata);
cache.store({
  input: 'post on linkedin',
  resolvedType: resolution.type,
  confidence: resolution.confidence,
  success: true,
  timestamp: new Date(),
  usageCount: 1
});
```

---

## 🔄 Integration Examples

### Example 1: Complete Resolution Flow

```typescript
async function resolveNodeType(userInput: string): Promise<string> {
  // Step 1: Analyze semantic intent
  const analyzer = new SemanticIntentAnalyzer();
  const intent = analyzer.analyze(userInput);
  
  // Step 2: Enrich node metadata
  const enricher = new NodeMetadataEnricher();
  const metadata = enricher.enrichAllNodes();
  
  // Step 3: Check cache
  const cache = new ResolutionLearningCache();
  const cached = cache.get(userInput);
  if (cached && cached.confidence > 0.8) {
    return cached.resolvedType;
  }
  
  // Step 4: Resolve using AI
  const resolver = new SemanticNodeResolver();
  const resolution = await resolver.resolve(intent, metadata);
  
  // Step 5: Cache result
  cache.store({
    input: userInput,
    resolvedType: resolution.type,
    confidence: resolution.confidence,
    success: true,
    timestamp: new Date(),
    usageCount: 1
  });
  
  // Step 6: Return canonical type
  return resolution.type;
}
```

---

### Example 2: Enhanced Prompt for Planner

```typescript
async function enhancePromptForPlanner(
  userPrompt: string
): Promise<EnhancedPrompt> {
  // Analyze intent
  const analyzer = new SemanticIntentAnalyzer();
  const intent = analyzer.analyze(userPrompt);
  
  // Resolve node types
  const resolver = new SemanticNodeResolver();
  const metadata = new NodeMetadataEnricher().enrichAllNodes();
  const resolution = await resolver.resolve(intent, metadata);
  
  // Enhance prompt
  const enhancer = new ContextAwarePromptEnhancer();
  return enhancer.enhanceForPlanner(userPrompt, {
    semanticIntent: intent,
    nodeMetadata: metadata,
    resolvedNodes: [resolution]
  });
}
```

---

## 📊 Error Handling

### Error Types

```typescript
class NodeResolutionError extends Error {
  constructor(
    message: string,
    public code: 'NO_MATCH' | 'LOW_CONFIDENCE' | 'AMBIGUOUS' | 'INVALID_INPUT',
    public alternatives?: NodeResolution[]
  ) {
    super(message);
  }
}
```

### Error Handling Example

```typescript
try {
  const resolution = await resolver.resolve(intent, metadata);
  
  if (resolution.confidence < 0.7) {
    throw new NodeResolutionError(
      'Low confidence resolution',
      'LOW_CONFIDENCE',
      resolution.alternatives
    );
  }
  
  return resolution.type;
} catch (error) {
  if (error instanceof NodeResolutionError) {
    // Handle gracefully
    if (error.alternatives && error.alternatives.length > 0) {
      // Return best alternative
      return error.alternatives[0].type;
    }
  }
  throw error;
}
```

---

## 🎯 API Versioning

### Version 1.0 (Current)

- Semantic Intent Analyzer
- Node Metadata Enricher
- AI-Powered Resolver
- Context-Aware Enhancer
- Unified Node Type Format

### Future Versions

- Version 1.1: Enhanced caching
- Version 2.0: Multi-language support
- Version 2.1: Advanced learning

---

**This API specification provides complete interface contracts for integrating semantic node resolution into the workflow generation system.**
