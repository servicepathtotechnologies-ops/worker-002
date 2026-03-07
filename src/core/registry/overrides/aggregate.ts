/**
 * ✅ AGGREGATE NODE - Migrated to Registry
 * 
 * Aggregates data (sum, avg, min, max).
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideAggregate(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex aggregation logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
