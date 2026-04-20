/**
 * ✅ ZENDESK NODE - Migrated to Registry
 *
 * Zendesk REST API integration — tickets, users, support operations.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

const requiredTags = ['zendesk', 'support', 'helpdesk', 'tickets', 'crm', 'api'];

export function overrideZendesk(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), ...requiredTags])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
