import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideEditFields(
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
            const fieldsRaw = prepared.mergedConfig.fields;
            if (Array.isArray(fieldsRaw)) {
              // UI sends [{name, value}] where name is the output key and value is an expression.
              // Convert to {outputKey: expression} object that the legacy switch case expects.
              const fieldsObj: Record<string, any> = {};
              for (const f of fieldsRaw) {
                if (f?.name !== undefined && f?.name !== '') {
                  fieldsObj[String(f.name)] = f.value ?? '';
                }
              }
              prepared.mergedConfig.fields = fieldsObj;
            }
          },
        },
      });
    },
  };
}
