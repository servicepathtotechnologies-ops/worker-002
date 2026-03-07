import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideTimeout(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    outgoingPorts: ['default', 'success', 'timeout'],
    isBranching: true,
    execute: async (context: NodeExecutionContext): Promise<NodeExecutionResult> => {
      const limit = context.config?.limit;
      
      if (typeof limit !== 'number' || limit <= 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_CONFIG',
            message: 'Invalid timeout limit. Must be a positive number.',
          },
        };
      }

      // Get workflow start time from context (set by engine) or use current time as fallback
      // The workflow engine should set workflowStartTime when workflow begins
      const workflowStart = (context as any).workflowStartTime || Date.now();
      const elapsed = Date.now() - workflowStart;
      const timedOut = elapsed > limit;

      return {
        success: true,
        output: {
          elapsedMs: elapsed,
          limit,
          timedOut,
          originalInput: context.rawInput,
        },
        metadata: {
          branch: timedOut ? 'timeout' : 'success',
        },
      };
    },
  };
}
