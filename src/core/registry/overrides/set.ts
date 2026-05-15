import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSet(
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
              // UI sends [{name, value}] — convert to JSON string that legacy code expects
              const fieldsObj: Record<string, any> = {};
              for (const f of fieldsRaw) {
                if (f?.name !== undefined && f?.name !== '') {
                  fieldsObj[String(f.name)] = f.value ?? '';
                }
              }
              prepared.mergedConfig.fields = JSON.stringify(fieldsObj);
            } else if (fieldsRaw && typeof fieldsRaw === 'object') {
              // Plain object {key: value} — stringify for legacy parser
              prepared.mergedConfig.fields = JSON.stringify(fieldsRaw);
            }
          },
        },
      });
    },
  };
}
