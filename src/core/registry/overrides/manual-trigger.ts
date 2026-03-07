/**
 * ✅ MANUAL TRIGGER NODE - Migrated to Registry
 * 
 * Simple trigger node that returns input as-is.
 * Used for manual workflow execution and testing.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideManualTrigger(
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
      
      // ✅ OPTIMIZED: Return clean output - just the input data, no trigger metadata
      // Manual trigger is typically used for testing, so return input as-is
      const result = inputObj && Object.keys(inputObj).length > 0 ? inputObj : {};
      
      return {
        success: true,
        output: result,
      };
    },
  };
}
