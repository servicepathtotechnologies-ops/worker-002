/**
 * ✅ PIPEDRIVE NODE - Migrated to Registry
 * 
 * Pipedrive CRM integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overridePipedrive(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Pipedrive API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
