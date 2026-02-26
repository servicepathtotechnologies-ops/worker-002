import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideIfElse(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    isBranching: true,
    outgoingPorts: ['true', 'false'],
    tags: Array.from(new Set([...(def.tags || []), 'conditional'])),
    execute: async (context) => {
      const result = await executeViaLegacyExecutor({
        context,
        schema,
        hooks: {
          beforeExecute: (prepared) => {
            // If/Else needs the FULL upstream data (not just schema-resolved inputs).
            const mergedInput: Record<string, unknown> = {
              ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null ? prepared.executionInput : {}),
            };

            context.upstreamOutputs.forEach((output) => {
              if (output && typeof output === 'object' && !Array.isArray(output)) {
                Object.assign(mergedInput, output as Record<string, unknown>);
              }
            });

            return { executionInput: mergedInput };
          },
        },
      });

      if (result.success && result.output) {
        const outObj = result.output as any;
        // Ensure output contains input items if legacy executor didn't forward them.
        const inputObj = context.inputs as any;
        if (!outObj.items && inputObj && inputObj.items) {
          return { success: true, output: { ...outObj, ...inputObj } };
        }
      }

      return result;
    },
  };
}

