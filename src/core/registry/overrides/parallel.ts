import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

/**
 * Parallel node — passthrough + mode from config; concurrent branch execution is
 * handled by the workflow engine. Single execution path via legacy executor.
 */
export function overrideParallel(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    outgoingPorts: ['default'],
    isBranching: true,
    execute: async (context: NodeExecutionContext): Promise<NodeExecutionResult> => {
      const result = await executeViaLegacyExecutor({ context, schema });
      if (!result.success) {
        return result;
      }
      const mode = context.config?.mode ?? 'all';
      return {
        ...result,
        metadata: {
          ...result.metadata,
          parallelMode: mode,
        },
      };
    },
  };
}
