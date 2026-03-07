/**
 * ✅ SORT NODE - Migrated to Registry
 * 
 * Sorts arrays by specified field.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSort(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex sorting logic with template resolution)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
