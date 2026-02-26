import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

/**
 * chat_model is an internal support node used to back AI agent nodes.
 * Mark it as internal so planners/builders can exclude it from "business workflow" topology decisions.
 */
export function overrideChatModel(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), 'internal'])),
  };
}

