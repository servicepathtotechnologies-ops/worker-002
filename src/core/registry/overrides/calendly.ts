/**
 * ✅ CALENDLY NODE - Migrated to Registry
 *
 * Calendly scheduling API integration — events, event types, scheduled meetings, user info.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideCalendly(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), 'calendly', 'scheduling', 'meetings', 'calendar', 'api'])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
