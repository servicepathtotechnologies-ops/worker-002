import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { nodeLibrary } from '../nodes/node-library';

/**
 * Registry-only node type normalization.
 * No semantic, keyword, or pattern fallbacks are allowed here.
 */
export function normalizeNodeType(nodeType: string): string {
  if (!nodeType || typeof nodeType !== 'string') {
    return nodeType;
  }

  const original = nodeType.trim();
  if (!original) {
    return nodeType;
  }

  const lower = original.toLowerCase();

  const aliasResolved = unifiedNodeRegistry.resolveAlias(lower);
  if (aliasResolved && nodeLibrary.isNodeTypeRegistered(aliasResolved)) {
    return aliasResolved;
  }

  if (unifiedNodeRegistry.has(lower) && nodeLibrary.isNodeTypeRegistered(lower)) {
    return lower;
  }

  if (nodeLibrary.isNodeTypeRegistered(original)) {
    return original;
  }

  const exact = nodeLibrary.getRegisteredNodeTypes().find((t) => t.toLowerCase() === lower);
  return exact ?? original;
}

export async function normalizeNodeTypeAsync(nodeType: string): Promise<string> {
  return normalizeNodeType(nodeType);
}
