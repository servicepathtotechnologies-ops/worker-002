import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

/**
 * Retry node — execution is defined in execute-workflow (legacy) and invoked here
 * so template resolution and config merge stay unified. Branching/retry loops remain
 * an orchestration concern; this node forwards input with retry config attached.
 */
export function overrideRetry(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    outgoingPorts: ['default', 'success', 'error'],
    isBranching: true,
    execute: async (context: NodeExecutionContext): Promise<NodeExecutionResult> => {
      const result = await executeViaLegacyExecutor({ context, schema });
      if (!result.success) {
        return result;
      }
      const maxAttempts = context.config?.maxAttempts ?? 3;
      const delayBetween = context.config?.delayBetween ?? 1000;
      const backoff = context.config?.backoff ?? 'none';
      return {
        ...result,
        metadata: {
          ...result.metadata,
          branch: 'success',
          retryConfig: { maxAttempts, delayBetween, backoff },
        },
      };
    },
  };
}
