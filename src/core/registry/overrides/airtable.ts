/**
 * ✅ AIRTABLE NODE - Migrated to Registry
 * 
 * Airtable integration for reading/writing records.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideAirtable(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Airtable API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
