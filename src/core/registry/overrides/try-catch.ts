/**
 * ✅ TRY_CATCH NODE - Real Execution Logic
 * 
 * Implements actual try/catch functionality:
 * - Routes execution to 'try' branch initially
 * - Provides error context for catch branch routing
 * - Uses legacy executor for proper execution flow
 */

import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideTryCatch(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    outgoingPorts: ['default', 'try', 'catch'],
    isBranching: true,
    execute: async (context: NodeExecutionContext): Promise<NodeExecutionResult> => {
      // ✅ REAL FUNCTIONALITY: Use legacy executor which has proper try_catch handling
      // The legacy executor will:
      // 1. Process the try_catch node configuration
      // 2. Return proper output with metadata for branch routing
      // 3. The execution engine will track this node and route errors to catch branch
      
      try {
        const result = await executeViaLegacyExecutor({
          context,
          schema,
          hooks: {
            beforeExecute: (prepared) => {
              // ✅ CRITICAL: Preserve ALL input data for try branch
              // The try branch needs access to all upstream data
              const mergedInput: Record<string, unknown> = {
                ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null ? prepared.executionInput : {}),
              };

              // Merge all upstream outputs into input
              context.upstreamOutputs.forEach((output) => {
                if (output && typeof output === 'object' && !Array.isArray(output)) {
                  Object.assign(mergedInput, output as Record<string, unknown>);
                }
              });

              return { executionInput: mergedInput };
            },
          },
        });

        // ✅ REAL FUNCTIONALITY: Return output with proper metadata for branch routing
        if (result.success && result.output) {
          const outputObj = result.output as any;
          
          // Ensure output contains all input data
          const inputObj = context.inputs as any;
          const finalOutput = {
            ...(typeof outputObj === 'object' && outputObj !== null ? outputObj : {}),
            ...(typeof inputObj === 'object' && inputObj !== null ? inputObj : {}),
          };

          return {
            success: true,
            output: finalOutput,
            metadata: {
              branch: 'try', // ✅ Always start with try branch
              tryCatchNodeId: context.nodeId, // ✅ Mark this as a try_catch node for error routing
              errorHandling: true, // ✅ Indicate this node handles errors
            },
          };
        }

        return result;
      } catch (error: any) {
        // ✅ REAL FUNCTIONALITY: If try_catch node itself fails, return error context
        // This allows the engine to route to catch branch
        return {
          success: false,
          error: {
            code: 'TRY_CATCH_ERROR',
            message: error?.message || 'Try/Catch node execution failed',
            details: error,
          },
          output: {
            ...(typeof context.rawInput === 'object' && context.rawInput !== null ? context.rawInput : {}),
            error: error?.message,
            errorType: error?.constructor?.name || 'Error',
          },
          metadata: {
            branch: 'catch', // ✅ Route to catch branch on error
            tryCatchNodeId: context.nodeId,
            errorHandling: true,
          },
        };
      }
    },
  };
}
