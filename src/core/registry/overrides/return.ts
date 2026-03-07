/**
 * ✅ RETURN NODE - Migrated to Registry
 * 
 * Early return from workflow.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideReturn(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (requires workflow control logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
