/**
 * ✅ QUEUE PUSH NODE - Migrated to Registry
 * 
 * Pushes items to queue.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideQueuePush(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
