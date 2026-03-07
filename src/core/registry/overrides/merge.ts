/**
 * ✅ MERGE NODE - Real Execution Logic
 * 
 * Implements actual data merging from multiple sources:
 * - Combines outputs from multiple incoming paths (true/false branches, switch cases, etc.)
 * - Supports different merge modes (overwrite, append, deep_merge)
 * - Preserves all data from all sources
 */

import type { UnifiedNodeDefinition, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideMerge(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context): Promise<NodeExecutionResult> => {
      // ✅ REAL FUNCTIONALITY: Use legacy executor which has merge logic
      // The execution engine already merges multiple inputs in buildNodeInput(),
      // but the legacy executor can apply merge-specific modes (overwrite, append, deep_merge)
      
      const result = await executeViaLegacyExecutor({
        context,
        schema,
        hooks: {
          beforeExecute: (prepared) => {
            // ✅ CRITICAL: Merge node needs ALL upstream outputs combined
            // The execution engine's buildNodeInput() already merges multiple inputs,
            // but we ensure all upstream data is included
            
            const mergedInput: Record<string, unknown> = {
              ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null ? prepared.executionInput : {}),
            };

            // Merge all upstream outputs (from multiple branches)
            context.upstreamOutputs.forEach((output) => {
              if (output && typeof output === 'object' && !Array.isArray(output)) {
                Object.assign(mergedInput, output as Record<string, unknown>);
              } else if (Array.isArray(output)) {
                // Handle array outputs - merge into items array
                if (!Array.isArray(mergedInput.items)) {
                  mergedInput.items = [];
                }
                mergedInput.items = [...(mergedInput.items as any[]), ...output];
              }
            });

            return { executionInput: mergedInput };
          },
        },
      });

      // ✅ REAL FUNCTIONALITY: Ensure merged output contains all data from all sources
      if (result.success && result.output) {
        const outObj = result.output as any;
        const inputObj = context.inputs as any;
        
        // Combine all input data (already merged by engine + our hooks)
        const finalOutput = {
          ...(typeof inputObj === 'object' && inputObj !== null ? inputObj : {}),
          ...(typeof outObj === 'object' && outObj !== null ? outObj : {}),
        };

        return { 
          success: true, 
          output: finalOutput,
          metadata: {
            merged: true,
            sourceCount: context.upstreamOutputs.size,
          },
        };
      }

      return result;
    },
  };
}
