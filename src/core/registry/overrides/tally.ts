/**
 * ✅ TALLY SOLUTIONS NODE - Migrated to Registry
 *
 * Tally ERP / TallyPrime integration via XML API.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideTally(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Delegate to legacy executor which handles the case 'tally' branch
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
