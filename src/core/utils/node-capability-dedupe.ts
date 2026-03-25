/**
 * Capability deduplication keys for workflow chain / injection logic.
 *
 * Branching nodes (if_else, switch, …) must NOT share a dedupe bucket with AI or generic
 * transforms — otherwise a required if_else is dropped when an AI node is already present.
 *
 * For nodes with `isBranching` in the unified registry, we return `null` so callers skip
 * coarse capability deduplication (exact-node and semantic-equivalence checks still apply).
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';
import { unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';

/** Coarse capability buckets for deduplication (matches all return paths of `getNodeCapabilityDedupeKey`). */
export type NodeCapabilityDedupeKey =
  | 'data_source'
  | 'output'
  | 'transformation'
  | 'ai_processing';

/**
 * Returns a key used to enforce "one slot per coarse role" in a linear chain.
 * `null` means: do not treat this node as consuming a generic data_source / ai / transformation / output slot.
 */
export function getNodeCapabilityDedupeKey(nodeType: string): NodeCapabilityDedupeKey | null {
  const normalized = unifiedNormalizeNodeTypeString(nodeType) || nodeType;

  if (unifiedNodeRegistry.allowsBranching(normalized)) {
    return null;
  }

  if (nodeCapabilityRegistryDSL.hasCapability(normalized, 'ai_processing')) {
    return 'ai_processing';
  }

  if (nodeCapabilityRegistryDSL.isDataSource(normalized)) {
    return 'data_source';
  }
  if (nodeCapabilityRegistryDSL.isOutput(normalized)) {
    return 'output';
  }
  if (nodeCapabilityRegistryDSL.isTransformation(normalized)) {
    return 'transformation';
  }

  const nodeDef = unifiedNodeRegistry.get(normalized);
  if (nodeDef) {
    const category = nodeDef.category;
    if (category === 'data' || category === 'trigger') {
      return 'data_source';
    }
    if (category === 'ai') {
      return 'ai_processing';
    }
    if (category === 'transformation' || category === 'utility') {
      return 'transformation';
    }
    if (category === 'logic') {
      return 'transformation';
    }
    if (category === 'communication' || category === 'social' || category === 'output') {
      return 'output';
    }
  }

  return 'transformation';
}
