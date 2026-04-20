/**
 * ✅ CHARGEBEE NODE - Migrated to Registry
 *
 * Chargebee subscription billing API — customers, subscriptions, payments.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideChargebee(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const requiredTags = ['chargebee', 'billing', 'subscription', 'payment', 'api'];
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), ...requiredTags])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
