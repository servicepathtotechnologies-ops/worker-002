import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideRenameKeys(
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
            const mappingsRaw = prepared.mergedConfig.mappings;
            if (Array.isArray(mappingsRaw)) {
              // UI sends [{name: fromKey, value: toKey}] — convert to {fromKey: toKey} object
              const mappingsObj: Record<string, string> = {};
              for (const m of mappingsRaw) {
                if (m?.name !== undefined && m?.name !== '') {
                  mappingsObj[String(m.name)] = String(m.value ?? '');
                }
              }
              prepared.mergedConfig.mappings = mappingsObj;
            }
          },
        },
      });
    },
  };
}
