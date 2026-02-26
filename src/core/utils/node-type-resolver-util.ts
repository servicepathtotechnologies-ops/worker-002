/**
 * Node Type Resolver Utility
 * 
 * Simple utility function to resolve node type aliases to canonical types.
 * This wraps the NodeTypeResolver service for easy use throughout the codebase.
 * 
 * Usage:
 *   import { resolveNodeType } from './node-type-resolver-util';
 *   const canonicalType = resolveNodeType('gmail'); // Returns 'google_gmail'
 * 
 * NOTE: NodeTypeResolver must be initialized with NodeLibrary before use.
 * This is done automatically in node-library.ts initialization.
 */

import { nodeTypeResolver } from '../../services/nodes/node-type-resolver';

// Use the singleton instance exported from node-type-resolver
// NOTE: This instance is initialized by NodeLibrary after NodeLibrary is created
function getNodeTypeResolver() {
  return nodeTypeResolver;
}

/**
 * Resolve a node type name to its canonical form
 * 
 * @param nodeType - The node type to resolve (e.g., 'gmail', 'ai', 'llm')
 * @param debug - Whether to log debug information (default: false)
 * @returns The canonical node type name (e.g., 'google_gmail', 'ai_service')
 * 
 * @example
 * resolveNodeType('gmail') // Returns 'google_gmail'
 * resolveNodeType('ai') // Returns 'ai_service'
 * resolveNodeType('google_gmail') // Returns 'google_gmail' (already canonical)
 */
export function resolveNodeType(nodeType: string, debug: boolean = false): string {
  if (!nodeType || typeof nodeType !== 'string') {
    if (debug) {
      console.warn(`[resolveNodeType] Invalid node type: ${nodeType}`);
    }
    return nodeType || '';
  }

  // Use NodeTypeResolver to resolve the type
  // Pass debug flag to resolver to control logging
  const resolver = getNodeTypeResolver();
  const resolution = resolver.resolve(nodeType, debug);

  if (!resolution || resolution.method === 'not_found') {
    // If not found, return original (let caller handle fallback)
    if (debug) {
      console.warn(`[resolveNodeType] Node type "${nodeType}" not found, returning original`);
    }
    return nodeType;
  }

  // Log resolution only if debug is explicitly enabled
  // Don't log for exact matches (already canonical)
  if (debug && resolution.method !== 'exact') {
    console.log(`[resolveNodeType] Resolved "${nodeType}" → "${resolution.resolved}" (${resolution.method})`);
  }

  return resolution.resolved;
}

/**
 * Resolve multiple node types at once
 * 
 * @param nodeTypes - Array of node types to resolve
 * @param debug - Whether to log debug information
 * @returns Array of canonical node types
 */
export function resolveNodeTypes(nodeTypes: string[], debug: boolean = false): string[] {
  return nodeTypes.map(type => resolveNodeType(type, debug));
}

/**
 * Check if a node type exists (after resolution)
 * 
 * @param nodeType - The node type to check
 * @param debug - Whether to log debug information
 * @returns True if the resolved node type exists in the registry
 */
export function nodeTypeExists(nodeType: string, debug: boolean = false): boolean {
  const resolved = resolveNodeType(nodeType, debug);
  const resolver = getNodeTypeResolver();
  const resolution = resolver.resolve(nodeType, debug);
  return resolution !== null && resolution.method !== 'not_found';
}
