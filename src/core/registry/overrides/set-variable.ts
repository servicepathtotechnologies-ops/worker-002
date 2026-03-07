/**
 * ✅ SET VARIABLE NODE - Migrated to Registry
 * 
 * Sets a variable value in the output.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSetVariable(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (requires template resolution)
      // TODO: Port full set_variable logic to registry when time permits
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
