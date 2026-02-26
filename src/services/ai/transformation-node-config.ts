/**
 * Central Configuration for Transformation Node Mappings
 * 
 * Maps transformation operations to their corresponding node types.
 * This centralizes transformation node type configuration to avoid
 * hardcoded strings across multiple files.
 * 
 * Usage:
 *   import { TRANSFORMATION_NODE_MAP, getTransformationNodeType } from './transformation-node-config';
 *   const nodeType = getTransformationNodeType('summarize'); // Returns 'ai_chat_model'
 */

/**
 * Central transformation operation to node type mapping
 * 
 * All transformation operations (summarize, analyze, classify, generate)
 * map to ai_chat_model, which is the unified AI transformation node.
 */
export const TRANSFORMATION_NODE_MAP: Record<string, string> = {
  summarize: 'ai_chat_model',
  summarise: 'ai_chat_model',
  analyze: 'ai_chat_model',
  analyse: 'ai_chat_model',
  classify: 'ai_chat_model',
  generate: 'ai_chat_model',
  translate: 'ai_chat_model',
  extract: 'ai_chat_model',
  process: 'ai_chat_model',
  transform: 'ai_chat_model',
};

/**
 * Get the node type for a transformation operation
 * 
 * @param operation - Transformation operation (e.g., 'summarize', 'analyze')
 * @returns Node type for the transformation, or 'ai_chat_model' as default
 */
export function getTransformationNodeType(operation: string): string {
  if (!operation || typeof operation !== 'string') {
    return 'ai_chat_model';
  }
  
  const normalized = operation.toLowerCase().trim();
  return TRANSFORMATION_NODE_MAP[normalized] || 'ai_chat_model';
}

/**
 * Get all supported transformation operations
 * 
 * @returns Array of supported transformation operation names
 */
export function getSupportedTransformationOperations(): string[] {
  return Object.keys(TRANSFORMATION_NODE_MAP);
}

/**
 * Check if an operation is a transformation operation
 * 
 * @param operation - Operation to check
 * @returns True if the operation is a transformation operation
 */
export function isTransformationOperation(operation: string): boolean {
  if (!operation || typeof operation !== 'string') {
    return false;
  }
  
  const normalized = operation.toLowerCase().trim();
  return normalized in TRANSFORMATION_NODE_MAP;
}

/**
 * Get all node types that can handle transformations
 * Returns the unique set of node types from TRANSFORMATION_NODE_MAP
 * 
 * @returns Array of node types that can handle transformations
 */
export function getTransformationNodeTypes(): string[] {
  const nodeTypes = new Set(Object.values(TRANSFORMATION_NODE_MAP));
  return Array.from(nodeTypes);
}
