/**
 * ✅ WORKDAY NODE - Migrated to Registry
 *
 * Workday HR API integration — workers, jobs, organizations, supervisory organizations, positions.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideWorkday(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags ?? []), 'workday', 'hr', 'staffing', 'api'])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
