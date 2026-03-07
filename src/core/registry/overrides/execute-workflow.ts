/**
 * ✅ EXECUTE WORKFLOW NODE - Migrated to Registry
 * 
 * Executes a sub-workflow.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideExecuteWorkflow(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex sub-workflow execution logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
