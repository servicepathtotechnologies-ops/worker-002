/**
 * ✅ MATH NODE - Migrated to Registry
 * 
 * Performs mathematical operations.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideMath(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex math operations with type resolution)
      // TODO: Port full math logic to registry when time permits
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
