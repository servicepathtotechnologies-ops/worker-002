/**
 * ✅ SALESFORCE NODE - Migrated to Registry
 * 
 * Salesforce CRM integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSalesforce(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Salesforce API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
