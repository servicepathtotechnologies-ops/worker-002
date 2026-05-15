import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

function resolveJsonTemplates(template: string, json: Record<string, any>): string {
  return template.replace(/\{\{\s*\$json\.([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path) => {
    const keys = path.split('.');
    let val: any = json;
    for (const k of keys) { val = val?.[k]; }
    return val !== undefined && val !== null ? String(val) : '';
  });
}

export function overrideSetVariable(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      const cfg = context.config as Record<string, any>;

      // Handle values as [{name, value}] array (UI format)
      if (Array.isArray(cfg.values) && cfg.values.length > 0) {
        const rawInput = (
          context.rawInput &&
          typeof context.rawInput === 'object' &&
          !Array.isArray(context.rawInput)
        ) ? (context.rawInput as Record<string, any>) : {};
        const inputObj = (context.inputs as Record<string, any>) ?? {};

        const result: Record<string, any> = { ...inputObj };
        for (const entry of cfg.values) {
          const varName = String(entry?.name ?? '');
          if (!varName) continue;
          const rawValue = entry?.value ?? '';
          result[varName] = typeof rawValue === 'string'
            ? resolveJsonTemplates(rawValue, rawInput)
            : rawValue;
        }
        return { success: true, output: result };
      }

      // Fallback: legacy format (config.name + config.value single pair)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
