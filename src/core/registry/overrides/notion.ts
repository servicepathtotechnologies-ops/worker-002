/**
 * ✅ NOTION NODE - Migrated to Registry
 * 
 * Notion integration for reading/writing pages and databases.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideNotion(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Notion API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
