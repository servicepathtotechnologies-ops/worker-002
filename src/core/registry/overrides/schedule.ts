/**
 * ✅ SCHEDULE TRIGGER NODE - Migrated to Registry
 * 
 * Cron-based scheduling trigger.
 * Returns execution timestamp.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideSchedule(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      const { input } = context;
      
      // Extract input object
      const inputObj = typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      
      // ✅ OPTIMIZED: Schedule trigger - return clean output with just timestamp
      // Schedule triggers run at specific times, return execution timestamp
      return {
        success: true,
        output: {
          executed_at: new Date().toISOString(),
          ...(inputObj && Object.keys(inputObj).length > 0 ? inputObj : {}),
        },
      };
    },
  };
}
