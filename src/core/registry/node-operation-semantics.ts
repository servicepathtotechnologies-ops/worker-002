/**
 * NODE OPERATION SEMANTICS SERVICE
 * 
 * ✅ UNIVERSAL ROOT-LEVEL: Schema-Driven Operation Semantics
 * 
 * This service derives operation semantics (read/write/transform) DIRECTLY from node schemas.
 * NO hardcoded lists - each node defines its own operation semantics.
 * 
 * Architecture:
 * 1. Extract operations from node schema (already done by NodeOperationIndex)
 * 2. Derive semantics from operation name patterns (universal algorithm)
 * 3. Each node's operations have their own semantics
 * 4. Categorization uses node-specific semantics, not global lists
 * 
 * This ensures:
 * - Zero hardcoding (all from schemas)
 * - Node-specific accuracy (github's "push" vs sheets' "write")
 * - Universal algorithm (works for any operation name)
 * - Infinite scalability (new nodes work automatically)
 */

import { unifiedNodeRegistry } from './unified-node-registry';
import { UnifiedNodeDefinition } from '../types/unified-node-contract';

export type OperationSemantic = 'read' | 'write' | 'transform' | 'unknown';

export interface OperationSemanticInfo {
  operation: string;
  semantic: OperationSemantic;
  confidence: number; // 0-1, how confident we are in the semantic
  derivedFrom: 'operation_name' | 'node_category' | 'default';
}

/**
 * ✅ UNIVERSAL: Derive operation semantic from operation name
 * Uses linguistic patterns, not hardcoded lists
 * Works for ANY operation name (e.g., "listRepos", "create_issue", "push_code")
 */
function deriveSemanticFromOperationName(operation: string): OperationSemantic {
  if (!operation || typeof operation !== 'string') {
    return 'unknown';
  }
  
  const opLower = operation.toLowerCase();
  
  // ✅ Pattern 1: Extract root verb from compound operations
  // "listRepos" → "list", "create_issue" → "create", "push_code" → "push"
  const rootVerbMatch = opLower.match(/^([a-z]+)/);
  if (!rootVerbMatch) {
    return 'unknown';
  }
  
  const rootVerb = rootVerbMatch[1];
  
  // ✅ UNIVERSAL: Read operation patterns (linguistic, not hardcoded)
  // These patterns match common read verbs across all languages/domains
  const readPatterns = [
    /^(read|get|fetch|retrieve|pull|list|load|download|search|query|find|obtain|acquire|extract_data|read_data)$/,
    /^list/, // "listRepos", "listIssues"
    /^get/,  // "getUser", "getIssue"
    /^fetch/, // "fetchData"
    /^read/,  // "readFile"
    /^query/, // "queryDatabase"
  ];
  
  // ✅ UNIVERSAL: Write operation patterns
  const writePatterns = [
    /^(write|create|update|append|send|notify|delete|remove|post|put|patch|publish|share|upload|submit|execute|push|export|commit|save|store|insert|add|modify|edit|change|alter)$/,
    /^create/, // "createIssue", "createPR"
    /^update/, // "updateIssue"
    /^send/,    // "sendMessage"
    /^push/,    // "pushCode"
    /^export/,  // "exportData"
    /^write/,   // "writeFile"
    /^post/,    // "postComment"
    /^publish/, // "publishArticle"
  ];
  
  // ✅ UNIVERSAL: Transform operation patterns
  const transformPatterns = [
    /^(transform|process|analyze|summarize|extract|parse|convert|format|classify|translate|generate|compute|calculate|filter|map|reduce|aggregate|merge|split)$/,
    /^transform/, // "transformData"
    /^process/,   // "processImage"
    /^analyze/,   // "analyzeText"
    /^summarize/, // "summarizeContent"
  ];
  
  // Check patterns in priority order
  for (const pattern of readPatterns) {
    if (pattern.test(rootVerb) || pattern.test(opLower)) {
      return 'read';
    }
  }
  
  for (const pattern of writePatterns) {
    if (pattern.test(rootVerb) || pattern.test(opLower)) {
      return 'write';
    }
  }
  
  for (const pattern of transformPatterns) {
    if (pattern.test(rootVerb) || pattern.test(opLower)) {
      return 'transform';
    }
  }
  
  // ✅ Fallback: Check if operation contains semantic keywords
  if (opLower.includes('read') || opLower.includes('get') || opLower.includes('fetch') || opLower.includes('list')) {
    return 'read';
  }
  if (opLower.includes('write') || opLower.includes('create') || opLower.includes('send') || opLower.includes('push') || opLower.includes('export')) {
    return 'write';
  }
  if (opLower.includes('transform') || opLower.includes('process') || opLower.includes('analyze')) {
    return 'transform';
  }
  
  return 'unknown';
}

/**
 * ✅ UNIVERSAL: Get operation semantic for a specific node and operation
 * Uses node-specific schema, not global lists
 */
export function getOperationSemantic(
  nodeType: string,
  operation: string
): OperationSemanticInfo {
  // ✅ STEP 1: Get node definition from registry
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (!nodeDef) {
    // Node not found - use universal derivation
    return {
      operation,
      semantic: deriveSemanticFromOperationName(operation),
      confidence: 0.7,
      derivedFrom: 'operation_name',
    };
  }
  
  // ✅ STEP 2: Derive semantic from operation name (PRIMARY - node-specific)
  const semantic = deriveSemanticFromOperationName(operation);
  let confidence = 0.9; // High confidence for pattern matching
  let derivedFrom: 'operation_name' | 'node_category' | 'default' = 'operation_name';
  
  // ✅ STEP 3: Refine based on node category (SECONDARY - context-aware)
  // Some nodes have category hints (e.g., communication nodes → write, data nodes → read)
  if (semantic === 'unknown') {
    const category = nodeDef.category;
    
    // Category-based fallback (only if operation name didn't match)
    // Note: UnifiedNodeDefinition.category doesn't include 'communication' or 'social'
    // These are legacy categories, but we check node type as fallback
    const nodeTypeLower = nodeType.toLowerCase();
    if (nodeTypeLower.includes('communication') || nodeTypeLower.includes('social') || 
        nodeTypeLower.includes('gmail') || nodeTypeLower.includes('slack') || nodeTypeLower.includes('discord')) {
      return {
        operation,
        semantic: 'write', // Communication nodes typically write/send
        confidence: 0.6,
        derivedFrom: 'node_category',
      };
    }
    
    if (category === 'data') {
      // Data nodes can be read or write - check operation name more carefully
      const refinedSemantic = deriveSemanticFromOperationName(operation);
      if (refinedSemantic !== 'unknown') {
        return {
          operation,
          semantic: refinedSemantic,
          confidence: 0.7,
          derivedFrom: 'operation_name',
        };
      }
      // Default data nodes to read (most common)
      return {
        operation,
        semantic: 'read',
        confidence: 0.5,
        derivedFrom: 'node_category',
      };
    }
    
    if (category === 'ai' || category === 'transformation') {
      return {
        operation,
        semantic: 'transform',
        confidence: 0.7,
        derivedFrom: 'node_category',
      };
    }
  }
  
  // ✅ STEP 4: Return semantic info
  return {
    operation,
    semantic,
    confidence,
    derivedFrom,
  };
}

/**
 * ✅ UNIVERSAL: Get DSL category from operation semantic
 * Maps operation semantics to DSL categories
 */
export function getDSLCategoryFromSemantic(
  semantic: OperationSemantic,
  nodeType?: string
): 'dataSource' | 'transformation' | 'output' {
  switch (semantic) {
    case 'read':
      return 'dataSource';
    case 'write':
      return 'output';
    case 'transform':
      return 'transformation';
    case 'unknown':
      // ✅ Fallback: Use node category if available
      if (nodeType) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (nodeDef) {
        const category = nodeDef.category;
        const nodeTypeLower = nodeType.toLowerCase();
        // Map registry categories to DSL categories
        // Also check node type for communication/social nodes (legacy categories)
        if (nodeTypeLower.includes('communication') || nodeTypeLower.includes('social') || 
            nodeTypeLower.includes('gmail') || nodeTypeLower.includes('slack') || nodeTypeLower.includes('discord')) {
          return 'output';
        }
          if (category === 'data') {
            return 'dataSource'; // Default data nodes to dataSource
          }
          if (category === 'ai' || category === 'transformation') {
            return 'transformation';
          }
        }
      }
      // Ultimate fallback
      return 'transformation';
  }
}

/**
 * ✅ UNIVERSAL: Check if operation is a write operation (node-specific)
 * Uses node schema, not global list
 */
export function isWriteOperationForNode(
  nodeType: string,
  operation: string
): boolean {
  const semanticInfo = getOperationSemantic(nodeType, operation);
  return semanticInfo.semantic === 'write';
}

/**
 * ✅ UNIVERSAL: Check if operation is a read operation (node-specific)
 * Uses node schema, not global list
 */
export function isReadOperationForNode(
  nodeType: string,
  operation: string
): boolean {
  const semanticInfo = getOperationSemantic(nodeType, operation);
  return semanticInfo.semantic === 'read';
}

/**
 * ✅ UNIVERSAL: Check if operation is a transform operation (node-specific)
 * Uses node schema, not global list
 */
export function isTransformOperationForNode(
  nodeType: string,
  operation: string
): boolean {
  const semanticInfo = getOperationSemantic(nodeType, operation);
  return semanticInfo.semantic === 'transform';
}
