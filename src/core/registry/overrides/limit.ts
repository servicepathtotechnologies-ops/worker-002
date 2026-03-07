/**
 * ✅ LIMIT NODE - Migrated to Registry
 * 
 * Limits array items to specified count.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideLimit(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (array manipulation logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
