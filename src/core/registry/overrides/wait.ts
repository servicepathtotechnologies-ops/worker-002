/**
 * ✅ WAIT NODE - Migrated to Registry
 * 
 * Delays execution for specified duration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideWait(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (requires async delay logic)
      // TODO: Port full wait logic to registry when time permits
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
