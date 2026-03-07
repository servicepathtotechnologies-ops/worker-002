import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideRetry(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    outgoingPorts: ['default', 'success', 'error'],
    isBranching: true,
    execute: async (context: NodeExecutionContext): Promise<NodeExecutionResult> => {
      // Similar to try/catch, retry requires engine support.
      // We'll implement a simplified version where the retry node itself
      // repeatedly executes the connected node(s) until success or max attempts.
      // But that's not straightforward in the current architecture.
      
      // We'll return a branch 'success' if retries succeed, 'error' if all fail.
      // The actual retry logic must be handled by the engine.
      
      // For now, just a placeholder that indicates retry configuration.
      const maxAttempts = context.config?.maxAttempts || 3;
      const delayBetween = context.config?.delayBetween || 1000;
      const backoff = context.config?.backoff || 'none';

      return {
        success: true,
        output: {
          attempts: 0,
          maxAttempts,
          delayBetween,
          backoff,
          ...(typeof context.rawInput === 'object' && context.rawInput !== null ? context.rawInput : {}),
        },
        metadata: {
          branch: 'success', // assume success initially, engine will handle retries
          retryConfig: {
            maxAttempts,
            delayBetween,
            backoff,
          },
        },
      };
    },
  };
}
