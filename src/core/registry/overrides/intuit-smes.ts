/**
 * ✅ INTUIT SME NODE - Migrated to Registry
 * 
 * Intuit SME integration for customer and financial operations.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideIntuitSmes(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Intuit API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
