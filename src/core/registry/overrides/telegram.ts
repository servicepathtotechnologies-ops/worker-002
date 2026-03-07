/**
 * ✅ TELEGRAM NODE - Migrated to Registry
 * 
 * Telegram messaging integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideTelegram(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Telegram API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
