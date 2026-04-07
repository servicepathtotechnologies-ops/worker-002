/**
 * Node Type Resolver Utility — THIN WRAPPER (legacy compatibility shim)
 *
 * All resolution now delegates to unified-node-registry.ts (single source of truth).
 * This file exists only for backward compatibility during migration.
 * Once all callers are updated to import from unified-node-registry directly,
 * this file will be deleted.
 *
 * DO NOT add new logic here. Add aliases to unified-node-registry.ts ALIAS_MAP instead.
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';

/**
 * Resolve a node type alias to its canonical form.
 * Delegates to unified-node-registry.ts ALIAS_MAP — single source of truth.
 *
 * @param nodeType - The node type to resolve (e.g., 'gmail', 'email')
 * @param debug - Unused, kept for API compatibility
 * @returns The canonical node type name (e.g., 'google_gmail')
 */
export function resolveNodeType(nodeType: string, debug: boolean = false): string {
  if (!nodeType || typeof nodeType !== 'string') {
    return nodeType || '';
  }
  // Delegate to registry — single source of truth
  const resolved = unifiedNodeRegistry.resolveAlias(nodeType);
  if (resolved) {
    return resolved;
  }
  // If not in alias map but exists in registry, return as-is
  if (unifiedNodeRegistry.has(nodeType)) {
    return nodeType;
  }
  // Lowercase fallback
  const lower = nodeType.toLowerCase().trim();
  const resolvedLower = unifiedNodeRegistry.resolveAlias(lower);
  if (resolvedLower) {
    return resolvedLower;
  }
  if (unifiedNodeRegistry.has(lower)) {
    return lower;
  }
  // Return original — let callers decide how to handle unknown types
  return nodeType;
}

/**
 * Resolve multiple node types at once.
 */
export function resolveNodeTypes(nodeTypes: string[], debug: boolean = false): string[] {
  return nodeTypes.map(type => resolveNodeType(type, debug));
}

/**
 * Strict canonical resolver — only accepts types present in unified-node-registry.
 * Does not use alias heuristics.
 */
export function resolveCanonicalNodeTypeStrict(nodeType: string): string {
  const trimmed = typeof nodeType === 'string' ? nodeType.trim() : '';
  if (!trimmed) {
    throw new Error('Empty node type is not allowed');
  }
  if (unifiedNodeRegistry.has(trimmed)) {
    return trimmed;
  }
  const lowered = trimmed.toLowerCase();
  if (unifiedNodeRegistry.has(lowered)) {
    return lowered;
  }
  throw new Error(
    `[StrictNodeTypeResolver] Non-canonical node type "${nodeType}". ` +
    `Generation paths accept only node types present in unified-node-registry.`
  );
}

/**
 * Check if a node type exists in the registry.
 */
export function nodeTypeExists(nodeType: string): boolean {
  if (!nodeType) return false;
  return unifiedNodeRegistry.has(nodeType) || unifiedNodeRegistry.has(nodeType.toLowerCase().trim());
}
