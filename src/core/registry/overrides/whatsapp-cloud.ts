/**
 * ✅ WHATSAPP CLOUD NODE - Migrated to Registry
 * 
 * WhatsApp Cloud API messaging integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideWhatsappCloud(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
