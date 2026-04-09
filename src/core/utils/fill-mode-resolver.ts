import { FieldFillMode, NodeInputSchema } from '../types/unified-node-contract';
import { isCredentialOwnership } from './field-ownership';

export function resolveEffectiveFieldFillMode(
  fieldName: string,
  inputSchema?: NodeInputSchema,
  config?: Record<string, any>
): FieldFillMode {
  let candidate: FieldFillMode = 'manual_static';
  const explicitMode = config?._fillMode?.[fieldName];
  if (
    explicitMode === 'manual_static' ||
    explicitMode === 'runtime_ai' ||
    explicitMode === 'buildtime_ai_once'
  ) {
    candidate = explicitMode;
  } else {
    const schemaDefault = inputSchema?.[fieldName]?.fillMode?.default;
    if (
      schemaDefault === 'manual_static' ||
      schemaDefault === 'runtime_ai' ||
      schemaDefault === 'buildtime_ai_once'
    ) {
      candidate = schemaDefault;
    }
  }

  return coerceFieldFillModeByPolicy(fieldName, candidate, inputSchema, config).mode;
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
  inputSchema?: NodeInputSchema,
  config?: Record<string, any>
): {
  mode: FieldFillMode;
  coerced: boolean;
  reason?: 'runtime_not_supported' | 'buildtime_not_supported' | 'credential_locked';
} {
  const fieldDef = inputSchema?.[fieldName];

  if (fieldDef && isCredentialOwnership(fieldName, fieldDef)) {
    const policy = fieldDef.credentialTogglePolicy ?? 'locked';
    const unlocked =
      policy === 'unlockable' && config?._ownershipUnlock?.[fieldName] === true;
    if (!unlocked) {
      const fallbackMode =
        requestedMode === 'runtime_ai' || requestedMode === 'buildtime_ai_once'
          ? fieldDef.fillMode?.default || 'manual_static'
          : requestedMode;
      if (fallbackMode !== requestedMode) {
        return { mode: fallbackMode, coerced: true, reason: 'credential_locked' };
      }
    }
  }

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
