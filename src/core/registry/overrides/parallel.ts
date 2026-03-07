import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideParallel(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    // Parallel node has dynamic outgoing ports based on connections
    // The engine will determine how many branches exist
    outgoingPorts: ['default'], // Base port, engine will handle multiple branches
    isBranching: true, // Multiple branches can be connected
    execute: async (context: NodeExecutionContext): Promise<NodeExecutionResult> => {
      // In a real implementation, the parallel node would have multiple outgoing connections.
      // We need to get the next nodes for each branch from the workflow graph.
      // This requires access to the workflow definition.
      // For simplicity, we'll assume that the parallel node has a config field `branches` that lists node IDs.
      // But that's not how n8n works.
      
      // We'll skip full implementation and just return a placeholder.
      // The actual parallel execution must be handled by the workflow engine.
      // The engine should:
      // 1. Identify all nodes connected to this parallel node's output ports
      // 2. Execute them concurrently using Promise.all() or Promise.allSettled()
      // 3. Collect results and merge them
      // 4. Continue with the next node(s) after all branches complete
      
      const mode = context.config?.mode || 'all';

      return {
        success: true,
        output: {
          mode,
          results: [],
          ...(typeof context.rawInput === 'object' && context.rawInput !== null ? context.rawInput : {}),
        },
        metadata: {
          parallelMode: mode,
          // Engine should use this to determine execution strategy
        },
      };
    },
  };
}
