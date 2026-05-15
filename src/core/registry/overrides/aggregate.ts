import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideAggregate(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      return await executeViaLegacyExecutor({
        context,
        schema,
        hooks: {
          beforeExecute: (prepared) => {
            // If rawInput is a direct array, wrap it as { items: [...] } so the
            // legacy aggregate case (which reads inputObj.items) can find the data.
            if (
              Array.isArray(context.rawInput) &&
              !Array.isArray((prepared.executionInput as any)?.items)
            ) {
              return {
                executionInput: {
                  ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null
                    ? prepared.executionInput
                    : {}),
                  items: context.rawInput,
                },
              };
            }
          },
        },
      });
    },
  };
}
