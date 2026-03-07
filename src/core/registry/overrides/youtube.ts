/**
 * ✅ YOUTUBE NODE - Migrated to Registry
 * 
 * YouTube integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideYoutube(
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
