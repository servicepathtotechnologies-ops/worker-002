/**
 * ✅ PRODUCTION-GRADE: Node Type Authority
 * 
 * This is the STRICT VALIDATION GATE that prevents invalid node types
 * from entering the system.
 * 
 * Architecture Rules:
 * 1. Only canonical node types from NodeLibrary are valid
 * 2. LLM must select from CANONICAL_NODE_TYPES enum
 * 3. Any unknown node type is rejected BEFORE registry
 * 4. No fallback, no normalization, no silent recovery
 * 
 * This ensures:
 * - Closed-world node architecture
 * - Deterministic behavior
 * - No phantom nodes
 * - No LLM hallucinated node types
 */

import { CANONICAL_NODE_TYPES, isValidCanonicalNodeType } from '../../services/nodes/node-library';

/**
 * ✅ STRICT: Assert that a node type is valid (canonical)
 * 
 * Throws error if node type is not in CANONICAL_NODE_TYPES
 * 
 * Use this BEFORE calling registry methods
 */
export function assertValidNodeType(nodeType: string): void {
  if (!nodeType || typeof nodeType !== 'string') {
    throw new Error(
      `[NodeAuthority] Invalid node type: ${JSON.stringify(nodeType)}. ` +
      `Node type must be a non-empty string.`
    );
  }
  
  if (!isValidCanonicalNodeType(nodeType)) {
    const sampleTypes = CANONICAL_NODE_TYPES.slice(0, 10).join(', ');
    throw new Error(
      `[NodeAuthority] Invalid node type generated: "${nodeType}". ` +
      `Only canonical node types from NodeLibrary are allowed. ` +
      `Valid types (sample): ${sampleTypes}... ` +
      `Total valid types: ${CANONICAL_NODE_TYPES.length}. ` +
      `This indicates LLM generated an invalid node type or alias resolution failed.`
    );
  }
}

/**
 * ✅ STRICT: Validate multiple node types
 * 
 * Throws error if ANY node type is invalid
 */
export function assertValidNodeTypes(nodeTypes: string[]): void {
  for (const nodeType of nodeTypes) {
    assertValidNodeType(nodeType);
  }
}

/**
 * ✅ STRICT: Check if node type is valid (non-throwing)
 */
export function isValidNodeType(nodeType: string): boolean {
  return isValidCanonicalNodeType(nodeType);
}

/**
 * ✅ STRICT: Get all valid node types
 */
export function getValidNodeTypes(): readonly string[] {
  return CANONICAL_NODE_TYPES;
}
