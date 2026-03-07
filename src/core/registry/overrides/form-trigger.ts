/**
 * ✅ FORM TRIGGER NODE - Migrated to Registry
 * 
 * Form submission trigger.
 * Returns form data.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideFormTrigger(
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
      
      // ✅ OPTIMIZED: Form trigger - return clean form data
      // This matches the Form node implementation - return clean form data
      return {
        success: true,
        output: inputObj.data || {},
      };
    },
  };
}
