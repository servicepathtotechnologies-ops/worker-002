import { FieldFillMode, NodeInputSchema } from '../types/unified-node-contract';

export function resolveEffectiveFieldFillMode(
  fieldName: string,
  inputSchema?: NodeInputSchema,
  config?: Record<string, any>
): FieldFillMode {
  const explicitMode = config?._fillMode?.[fieldName];
  if (
    explicitMode === 'manual_static' ||
    explicitMode === 'runtime_ai' ||
    explicitMode === 'buildtime_ai_once'
  ) {
    return coerceFieldFillModeByPolicy(fieldName, explicitMode, inputSchema).mode;
  }

  const schemaDefault = inputSchema?.[fieldName]?.fillMode?.default;
  if (
    schemaDefault === 'manual_static' ||
    schemaDefault === 'runtime_ai' ||
    schemaDefault === 'buildtime_ai_once'
  ) {
    return schemaDefault;
  }

  return 'manual_static';
}

export function buildEffectiveFillModes(
  inputSchema?: NodeInputSchema,
  config?: Record<string, any>
): Record<string, FieldFillMode> {
  const result: Record<string, FieldFillMode> = {};
  if (!inputSchema || typeof inputSchema !== 'object') {
    return result;
  }

  for (const fieldName of Object.keys(inputSchema)) {
    result[fieldName] = resolveEffectiveFieldFillMode(fieldName, inputSchema, config);
  }

  return result;
}

export function coerceFieldFillModeByPolicy(
  fieldName: string,
  requestedMode: FieldFillMode,
  inputSchema?: NodeInputSchema
): {
  mode: FieldFillMode;
  coerced: boolean;
  reason?: 'runtime_not_supported' | 'buildtime_not_supported';
} {
  const fieldDef = inputSchema?.[fieldName];
  const fillMeta = fieldDef?.fillMode;
  if (!fillMeta) {
    return { mode: requestedMode, coerced: false };
  }

  if (requestedMode === 'runtime_ai' && fillMeta.supportsRuntimeAI === false) {
    return {
      mode: fillMeta.default === 'runtime_ai' ? 'manual_static' : fillMeta.default,
      coerced: true,
      reason: 'runtime_not_supported',
    };
  }
  if (requestedMode === 'buildtime_ai_once' && fillMeta.supportsBuildtimeAI === false) {
    return {
      mode: fillMeta.default === 'buildtime_ai_once' ? 'manual_static' : fillMeta.default,
      coerced: true,
      reason: 'buildtime_not_supported',
    };
  }

  return { mode: requestedMode, coerced: false };
}

export function isMeaningfulStaticValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}
