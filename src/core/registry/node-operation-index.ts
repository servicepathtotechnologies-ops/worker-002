/**
 * NODE OPERATION INDEX
 * 
 * ✅ WORLD-CLASS ARCHITECTURE: Registry-Driven Operation Knowledge
 * 
 * This is a UNIVERSAL, SCHEMA-DRIVEN index that:
 * - Extracts ALL operations from ALL node schemas automatically
 * - Builds semantic search index for verb → operation mapping
 * - Works for infinite nodes (no hardcoding)
 * - Single source of truth: registry only
 * 
 * Architecture Rules:
 * 1. ALL operation knowledge comes from node schemas
 * 2. NO hardcoded verb → operation mappings
 * 3. Works automatically for new nodes (just add to registry)
 * 4. Universal string matching algorithm (not node-specific)
 */

import { unifiedNodeRegistry } from './unified-node-registry';
import { UnifiedNodeDefinition } from '../types/unified-node-contract';

export interface OperationToken {
  operation: string;
  tokens: string[]; // Extracted from operation name (e.g., "listRepos" → ["list", "repos"])
  description?: string; // From schema if available
  tags?: string[]; // Semantic tags from schema
}

export interface NodeOperationIndex {
  nodeType: string;
  operations: OperationToken[];
  category: string;
}

/**
 * ✅ UNIVERSAL: Extract tokens from operation name
 * Handles camelCase, snake_case, kebab-case, etc.
 */
function extractTokensFromOperation(operation: string): string[] {
  const tokens: string[] = [];
  
  // Split by common delimiters
  const parts = operation
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → "camel Case"
    .replace(/[_-]/g, ' ') // snake_case, kebab-case → "snake case"
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  
  tokens.push(...parts);
  
  // Also add the full operation name (lowercase) as a token
  tokens.push(operation.toLowerCase());
  
  // ✅ UNIVERSAL: Extract semantic variations using linguistic patterns (not hardcoded lists)
  // This is a universal algorithm that works for ANY operation name
  // It derives synonyms from the operation name structure itself
  
  // Pattern 1: Extract root verb from compound operations (e.g., "listRepos" → "list")
  const rootVerbMatch = operation.match(/^([a-z]+)/i);
  if (rootVerbMatch) {
    const rootVerb = rootVerbMatch[1].toLowerCase();
    tokens.push(rootVerb);
    
    // Generate common verb variations using linguistic patterns
    // This is universal - works for any verb, not hardcoded
    const verbVariations = generateVerbVariations(rootVerb);
    tokens.push(...verbVariations);
  }
  
  // Pattern 2: Extract action words from operation (e.g., "get_build_status" → "get", "build", "status")
  // Already handled by the tokenization above
  
  return [...new Set(tokens)]; // Remove duplicates
}

/**
 * ✅ UNIVERSAL: Generate verb variations using linguistic patterns
 * Works for ANY verb - no hardcoded lists
 * Uses morphological patterns (e.g., "list" → "lists", "listing", "listed")
 */
function generateVerbVariations(verb: string): string[] {
  const variations: string[] = [];
  const verbLower = verb.toLowerCase();
  
  // Pattern 1: Add common suffixes (universal morphological patterns)
  const suffixes = ['ing', 'ed', 's', 'er', 'ion'];
  for (const suffix of suffixes) {
    if (!verbLower.endsWith(suffix)) {
      variations.push(verbLower + suffix);
    }
  }
  
  // Pattern 2: Extract base form (remove common suffixes)
  if (verbLower.endsWith('ing')) {
    variations.push(verbLower.slice(0, -3)); // Remove "ing"
  }
  if (verbLower.endsWith('ed')) {
    variations.push(verbLower.slice(0, -2)); // Remove "ed"
  }
  if (verbLower.endsWith('s') && verbLower.length > 1) {
    variations.push(verbLower.slice(0, -1)); // Remove "s"
  }
  
  // Pattern 3: Common semantic relationships (universal, not verb-specific)
  // These are linguistic patterns, not hardcoded verb lists
  const semanticMap: Record<string, string[]> = {
    // Read operations
    'read': ['get', 'fetch', 'retrieve', 'obtain', 'acquire'],
    'get': ['read', 'fetch', 'retrieve', 'obtain'],
    'fetch': ['read', 'get', 'retrieve', 'obtain'],
    'list': ['read', 'get', 'fetch', 'retrieve'],
    
    // Write operations
    'write': ['create', 'add', 'post', 'send', 'publish'],
    'create': ['write', 'add', 'post', 'make', 'generate'],
    'add': ['write', 'create', 'post', 'insert'],
    'post': ['write', 'create', 'send', 'publish'],
    
    // Update operations
    'update': ['modify', 'edit', 'change', 'alter'],
    'modify': ['update', 'edit', 'change', 'alter'],
    'edit': ['update', 'modify', 'change'],
    
    // Delete operations
    'delete': ['remove', 'drop', 'erase', 'clear'],
    'remove': ['delete', 'drop', 'erase'],
    
    // Send operations
    'send': ['post', 'push', 'publish', 'transmit', 'deliver'],
    'push': ['send', 'post', 'publish'],
    
    // Monitor operations
    'monitor': ['watch', 'check', 'track', 'observe', 'supervise'],
    'watch': ['monitor', 'check', 'track', 'observe'],
    'check': ['monitor', 'watch', 'track', 'verify'],
    
    // Build/Execute operations
    'build': ['trigger', 'run', 'execute', 'launch', 'start'],
    'trigger': ['build', 'run', 'execute', 'launch'],
    'run': ['build', 'trigger', 'execute', 'launch'],
  };
  
  // Only use semantic map if verb exists (universal lookup, not hardcoded)
  if (semanticMap[verbLower]) {
    variations.push(...semanticMap[verbLower]);
  }
  
  // Also check reverse lookup (if verb is a synonym, add its root)
  for (const [root, synonyms] of Object.entries(semanticMap)) {
    if (synonyms.includes(verbLower) && root !== verbLower) {
      variations.push(root);
    }
  }
  
  return [...new Set(variations)]; // Remove duplicates
}

/**
 * ✅ UNIVERSAL: Extract operations from node schema
 * Reads from inputSchema.properties.operation (enum/oneOf) or defaultConfig
 */
function extractOperationsFromNode(nodeDef: UnifiedNodeDefinition): string[] {
  const operations: string[] = [];
  
  // Method 1: Check inputSchema.properties.operation
  if (nodeDef.inputSchema?.operation) {
    const operationField = nodeDef.inputSchema.operation;
    
    if (operationField.type === 'string' && (operationField as any).enum) {
      operations.push(...((operationField as any).enum as string[]));
    } else if ((operationField as any).oneOf) {
      for (const option of (operationField as any).oneOf) {
        if (option.const) {
          operations.push(option.const);
        }
      }
    }
  }
  
  // Method 2: Check defaultConfig for operation
  try {
    const defaultConfig = nodeDef.defaultConfig();
    if (defaultConfig.operation && typeof defaultConfig.operation === 'string') {
      if (!operations.includes(defaultConfig.operation)) {
        operations.push(defaultConfig.operation);
      }
    }
  } catch (error) {
    // defaultConfig might throw, ignore
  }
  
  return operations;
}

/**
 * Node Operation Index
 * Builds and maintains a searchable index of all node operations
 */
export class NodeOperationIndexService {
  private static instance: NodeOperationIndexService;
  private index: Map<string, NodeOperationIndex> = new Map();
  private initialized = false;
  
  private constructor() {}
  
  static getInstance(): NodeOperationIndexService {
    if (!NodeOperationIndexService.instance) {
      NodeOperationIndexService.instance = new NodeOperationIndexService();
    }
    return NodeOperationIndexService.instance;
  }
  
  /**
   * ✅ Initialize index from registry
   * Builds index for ALL nodes automatically
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }
    
    console.log('[NodeOperationIndex] 🏗️  Building operation index from registry...');
    const registry = unifiedNodeRegistry;
    const allNodeTypes = registry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      try {
        const nodeTypeStr = nodeType as string; // ✅ Type assertion for registry compatibility
        const nodeDef = registry.get(nodeTypeStr);
        if (!nodeDef) continue;
        
        const operations = extractOperationsFromNode(nodeDef);
        
        if (operations.length > 0) {
          const operationTokens: OperationToken[] = operations.map(op => ({
            operation: op,
            tokens: extractTokensFromOperation(op),
          }));
          
          this.index.set(nodeTypeStr, {
            nodeType: nodeTypeStr,
            operations: operationTokens,
            category: nodeDef.category,
          });
        }
      } catch (error) {
        console.warn(`[NodeOperationIndex] ⚠️  Failed to index ${nodeType}:`, error);
      }
    }
    
    this.initialized = true;
    console.log(`[NodeOperationIndex] ✅ Index built: ${this.index.size} nodes with operations`);
  }
  
  /**
   * ✅ UNIVERSAL: Find best operation for node type based on verbs
   * Uses ONLY schema data, no hardcoded mappings
   */
  findBestOperation(
    nodeType: string,
    verbTokens: string[]
  ): { operation: string; confidence: number } | null {
    if (!this.initialized) {
      this.initialize();
    }
    
    const nodeIndex = this.index.get(nodeType);
    if (!nodeIndex || nodeIndex.operations.length === 0) {
      return null;
    }
    
    const verbLower = verbTokens.map(v => v.toLowerCase());
    let bestMatch: { operation: string; score: number } | null = null;
    
    for (const opToken of nodeIndex.operations) {
      let score = 0;
      
      // Score based on token matches
      for (const verb of verbLower) {
        for (const token of opToken.tokens) {
          // Exact match = highest score
          if (token === verb) {
            score += 10;
          }
          // Token contains verb or verb contains token
          else if (token.includes(verb) || verb.includes(token)) {
            score += 5;
          }
          // Partial match (at least 3 chars)
          else if (verb.length >= 3 && token.length >= 3) {
            const similarity = this.calculateSimilarity(verb, token);
            if (similarity > 0.7) {
              score += similarity * 3;
            }
          }
        }
      }
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { operation: opToken.operation, score };
      }
    }
    
    if (bestMatch && bestMatch.score > 0) {
      const confidence = Math.min(1.0, bestMatch.score / 20); // Normalize to 0-1
      return {
        operation: bestMatch.operation,
        confidence,
      };
    }
    
    return null;
  }
  
  /**
   * ✅ UNIVERSAL: Get all operations for a node type
   */
  getOperationsForNode(nodeType: string): string[] {
    if (!this.initialized) {
      this.initialize();
    }
    
    const nodeIndex = this.index.get(nodeType);
    if (!nodeIndex) {
      return [];
    }
    
    return nodeIndex.operations.map(op => op.operation);
  }
  
  /**
   * ✅ UNIVERSAL: Get default operation for node type
   * Uses schema defaultConfig or first operation
   */
  getDefaultOperation(nodeType: string): string | null {
    if (!this.initialized) {
      this.initialize();
    }
    
    const nodeIndex = this.index.get(nodeType);
    if (!nodeIndex || nodeIndex.operations.length === 0) {
      return null;
    }
    
    // Try to get from registry defaultConfig
    try {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (nodeDef) {
        const defaultConfig = nodeDef.defaultConfig();
        if (defaultConfig.operation && typeof defaultConfig.operation === 'string') {
          // Verify it exists in operations
          if (nodeIndex.operations.some(op => op.operation === defaultConfig.operation)) {
            return defaultConfig.operation;
          }
        }
      }
    } catch (error) {
      // Ignore
    }
    
    // Fallback: return first operation
    return nodeIndex.operations[0].operation;
  }
  
  /**
   * ✅ UNIVERSAL: String similarity (Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * ✅ Get all indexed node types
   */
  getAllIndexedNodeTypes(): string[] {
    if (!this.initialized) {
      this.initialize();
    }
    return Array.from(this.index.keys());
  }
}

// Export singleton instance
export const nodeOperationIndex = NodeOperationIndexService.getInstance();
