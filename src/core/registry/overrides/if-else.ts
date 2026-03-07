/**
 * ✅ IF_ELSE NODE - Real Execution Logic
 * 
 * Implements actual conditional branching:
 * - Evaluates conditions using legacy executor (has full condition evaluation logic)
 * - Routes to 'true' or 'false' branch based on condition result
 * - Preserves all input data for downstream nodes
 */

import type { UnifiedNodeDefinition, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideIfElse(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    isBranching: true,
    outgoingPorts: ['true', 'false'],
    tags: Array.from(new Set([...(def.tags || []), 'conditional'])),
    execute: async (context): Promise<NodeExecutionResult> => {
      // ✅ REAL FUNCTIONALITY: Use legacy executor which has full condition evaluation logic
      // The legacy executor will:
      // 1. Parse and evaluate the condition expression
      // 2. Resolve template variables ({{$json.items.length}}, etc.)
      // 3. Return result with condition evaluation metadata
      
      const result = await executeViaLegacyExecutor({
        context,
        schema,
        hooks: {
          beforeExecute: (prepared) => {
            // ✅ CRITICAL: If/Else needs the FULL upstream data for condition evaluation
            // Conditions often reference upstream data like {{$json.items.length}}
            const mergedInput: Record<string, unknown> = {
              ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null ? prepared.executionInput : {}),
            };

            // Merge all upstream outputs into input for condition evaluation
            context.upstreamOutputs.forEach((output) => {
              if (output && typeof output === 'object' && !Array.isArray(output)) {
                Object.assign(mergedInput, output as Record<string, unknown>);
              }
            });

            return { executionInput: mergedInput };
          },
        },
      });

      // ✅ REAL FUNCTIONALITY: Ensure output contains condition result and all input data
      if (result.success && result.output) {
        const outObj = result.output as any;
        const inputObj = context.inputs as any;
        
        // Preserve condition evaluation result (true/false) for branch routing
        const finalOutput = {
          ...(typeof inputObj === 'object' && inputObj !== null ? inputObj : {}),
          ...(typeof outObj === 'object' && outObj !== null ? outObj : {}),
        };

        // Ensure condition result is preserved (legacy executor sets this)
        if (outObj.conditionResult !== undefined) {
          finalOutput.conditionResult = outObj.conditionResult;
        }

        return { 
          success: true, 
          output: finalOutput,
          metadata: {
            branch: outObj.conditionResult ? 'true' : 'false', // ✅ Route to correct branch
            conditionEvaluated: true,
          },
        };
      }

      return result;
    },
  };
}

