/**
 * ✅ GOOGLE SHEETS NODE - Migrated to Registry
 * 
 * Google Sheets integration for reading/writing data.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideGoogleSheets(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Google Sheets API integration)
      // TODO: Port full Google Sheets logic to registry when time permits
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
