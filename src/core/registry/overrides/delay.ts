/**
 * ✅ DELAY NODE - Migrated to Registry
 * 
 * Delays execution (alias for wait).
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideDelay(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (same as wait)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
