/**
 * ✅ SCHEDULEWISE NODE - Migrated to Registry
 *
 * ScheduleWise healthcare scheduling integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideScheduleWise(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: [...(def.tags || []), 'integration', 'scheduling', 'healthcare', 'api'],
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
