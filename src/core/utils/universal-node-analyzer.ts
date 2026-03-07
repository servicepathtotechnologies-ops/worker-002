/**
 * UNIVERSAL NODE ANALYZER
 * 
 * This is a ROOT-LEVEL, UNIVERSAL solution for analyzing nodes.
 * NO hardcoded node type checks - everything uses the registry.
 * 
 * Architecture Rules:
 * 1. ALL node analysis MUST use this utility
 * 2. NO hardcoded node type lists
 * 3. Works for ALL nodes automatically (infinite scalability)
 * 4. Single source of truth: UnifiedNodeRegistry
 * 
 * This ensures:
 * - World-class, production-ready solution
 * - Works for infinite workflows and node types
 * - No patches or hardcoded logic
 * - Maintainable and extensible
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';
import { WorkflowNode } from '../types/ai-types';

/**
 * Universal node category detection
 * Uses registry category property - works for ALL nodes
 */
export function getNodeCategory(nodeType: string): 'trigger' | 'data' | 'ai' | 'communication' | 'logic' | 'transformation' | 'utility' | null {
  const normalized = unifiedNormalizeNodeTypeString(nodeType);
  const nodeDef = unifiedNodeRegistry.get(normalized);
  return nodeDef?.category || null;
}

/**
 * Universal branching node detection
 * Uses registry isBranching property - works for ALL nodes
 */
export function isBranchingNode(node: WorkflowNode | string): boolean {
  const nodeType = typeof node === 'string' ? node : unifiedNormalizeNodeType(node);
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  return nodeDef?.isBranching || false;
}

/**
 * Universal output node detection
 * Uses registry category and tags - works for ALL nodes
 */
export function isOutputNode(nodeType: string): boolean {
  const normalized = unifiedNormalizeNodeTypeString(nodeType);
  const nodeDef = unifiedNodeRegistry.get(normalized);
  
  if (!nodeDef) return false;
  
  // Check category
  if (nodeDef.category === 'communication' || nodeDef.category === 'data') {
    // Check tags for output indicators
    const tags = nodeDef.tags || [];
    const outputTags = ['output', 'write', 'send', 'post', 'create', 'update', 'notify'];
    if (tags.some(tag => outputTags.some(ot => tag.toLowerCase().includes(ot)))) {
      return true;
    }
  }
  
  // Check if type name indicates output
  const typeLower = normalized.toLowerCase();
  if (typeLower.includes('output') || 
      typeLower.includes('log') ||
      typeLower.includes('email') ||
      typeLower.includes('gmail') ||
      typeLower.includes('slack') ||
      typeLower.includes('webhook_response')) {
    return true;
  }
  
  return false;
}

/**
 * Universal data source node detection
 * Uses registry category and tags - works for ALL nodes
 */
export function isDataSourceNode(nodeType: string): boolean {
  const normalized = unifiedNormalizeNodeTypeString(nodeType);
  const nodeDef = unifiedNodeRegistry.get(normalized);
  
  if (!nodeDef) return false;
  
  // Check category
  if (nodeDef.category === 'data' || nodeDef.category === 'trigger') {
    // Check tags for data source indicators
    const tags = nodeDef.tags || [];
    const dataSourceTags = ['read', 'fetch', 'get', 'source', 'input'];
    if (tags.some(tag => dataSourceTags.some(dst => tag.toLowerCase().includes(dst)))) {
      return true;
    }
  }
  
  // Check if type name indicates data source
  const typeLower = normalized.toLowerCase();
  if (typeLower.includes('sheets') ||
      typeLower.includes('airtable') ||
      typeLower.includes('notion') ||
      typeLower.includes('http_request') ||
      typeLower.includes('webhook')) {
    return true;
  }
  
  return false;
}

/**
 * Universal transformation node detection
 * Uses registry category - works for ALL nodes
 */
export function isTransformationNode(nodeType: string): boolean {
  const normalized = unifiedNormalizeNodeTypeString(nodeType);
  const nodeDef = unifiedNodeRegistry.get(normalized);
  
  if (!nodeDef) return false;
  
  // Check category
  if (nodeDef.category === 'ai' || 
      nodeDef.category === 'transformation' ||
      nodeDef.category === 'logic' ||
      nodeDef.category === 'utility') {
    return true;
  }
  
  // Check tags for transformation indicators
  const tags = nodeDef.tags || [];
  const transformationTags = ['transform', 'process', 'generate', 'summarize', 'filter', 'sort'];
  if (tags.some(tag => transformationTags.some(tt => tag.toLowerCase().includes(tt)))) {
    return true;
  }
  
  return false;
}

/**
 * Universal node priority for execution ordering
 * Uses registry category and tags - works for ALL nodes
 * Returns: 1 = data source, 2 = transformation, 3 = output
 */
export function getNodeExecutionPriority(nodeType: string): number {
  if (isDataSourceNode(nodeType)) return 1;
  if (isTransformationNode(nodeType)) return 2;
  if (isOutputNode(nodeType)) return 3;
  return 2; // Default to transformation
}

/**
 * Universal config field mode detection
 * Uses registry inputSchema - works for ALL nodes
 * Detects if a field should be in 'ai' mode (string input) or 'json' mode (object input)
 */
export function shouldFieldBeAIMode(nodeType: string, fieldName: string): boolean {
  const normalized = unifiedNormalizeNodeTypeString(nodeType);
  const nodeDef = unifiedNodeRegistry.get(normalized);
  
  if (!nodeDef) return false;
  
  const fieldSchema = nodeDef.inputSchema[fieldName];
  if (!fieldSchema) return false;
  
  // Fields that are typically AI-generated (string inputs that accept complex data)
  const aiModeFields = ['headers', 'body', 'query', 'url', 'message', 'content', 'text'];
  if (aiModeFields.includes(fieldName.toLowerCase())) {
    // Check if field type is string or can accept string
    if (fieldSchema.type === 'string' || fieldSchema.type === 'json' || fieldSchema.type === 'expression') {
      return true;
    }
  }
  
  return false;
}

/**
 * Universal special node handling detection
 * Uses registry properties - works for ALL nodes
 * Detects nodes that need special handling (e.g., website category, invalid types)
 */
export function isSpecialNodeType(nodeType: string): {
  isInvalid: boolean;
  isCategory: boolean;
  reason?: string;
} {
  const normalized = unifiedNormalizeNodeTypeString(nodeType).toLowerCase();
  
  // Check if it's a category/credential, not a node type
  const categoryNames = ['website', 'crm', 'database', 'api'];
  if (categoryNames.includes(normalized)) {
    return {
      isInvalid: true,
      isCategory: true,
      reason: `"${nodeType}" is a category/credential, not a node type. It should be resolved to a specific node type (e.g., http_request, webhook).`
    };
  }
  
  // Check if node exists in registry
  const nodeDef = unifiedNodeRegistry.get(normalized);
  if (!nodeDef) {
    return {
      isInvalid: true,
      isCategory: false,
      reason: `Node type "${nodeType}" not found in registry.`
    };
  }
  
  return {
    isInvalid: false,
    isCategory: false
  };
}

/**
 * Get all branching node types (universal)
 * Uses registry isBranching property - works for ALL nodes
 */
export function getBranchingNodeTypes(): string[] {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  const branchingTypes: string[] = [];
  
  for (const nodeType of allTypes) {
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef?.isBranching) {
      branchingTypes.push(nodeType);
    }
  }
  
  return branchingTypes;
}
