/**
 * ✅ JAVASCRIPT NODE - Migrated to Registry
 * 
 * Custom JavaScript code execution.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideJavascript(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex JavaScript sandboxing logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
