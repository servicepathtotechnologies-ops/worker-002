/**
 * ✅ HUBSPOT NODE - Migrated to Registry
 * 
 * HubSpot CRM integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideHubspot(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex HubSpot API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
