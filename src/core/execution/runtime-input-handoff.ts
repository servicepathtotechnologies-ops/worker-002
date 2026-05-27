import type {
  FieldFillMode,
  NodeInputSchema,
  ProviderExecutionContext,
  RuntimeInputHandoffAudit,
  RuntimeInputOwnership,
  RuntimeInputSource,
} from '../types/unified-node-contract';
import type { NormalizedOperationContract } from '../operations/operation-contract-resolver';
import { fieldAllowsEmptyValue } from '../operations/operation-contract-resolver';
import type { ResolvedOperationFieldPolicy } from '../operations/field-policy-resolver';
import { isCredentialOwnership } from '../utils/field-ownership';
import { isRuntimeEmptyValue } from './runtime-field-contract';

const RUNTIME_AUTHORITY_SOURCES = new Set<RuntimeInputSource>([
  'runtime_ai',
  'field_directive_ai',
  'deterministic_runtime',
]);

function preview(fieldName: string, value: unknown): unknown {
  const lower = fieldName.toLowerCase();
  if (
    lower.includes('credential') ||
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('apikey') ||
    lower.includes('api_key')
  ) {
    return value === undefined ? undefined : '[MASKED]';
  }
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  if (Array.isArray(value)) return value.length > 5 ? [...value.slice(0, 5), `... ${value.length - 5} more`] : value;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 12);
    const out = Object.fromEntries(entries);
    const rest = Object.keys(value as Record<string, unknown>).length - entries.length;
    if (rest > 0) out.__truncatedKeys = rest;
    return out;
  }
  return value;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function ownershipFor(
  fieldName: string,
  inputSchema: NodeInputSchema,
  effectiveFillModes: Record<string, FieldFillMode>
): RuntimeInputOwnership {
  const fieldDef = inputSchema[fieldName];
  if (fieldDef && isCredentialOwnership(fieldName, fieldDef)) return 'credential';
  return effectiveFillModes[fieldName] || fieldDef?.fillMode?.default || 'manual_static';
}

function shouldResolvedValueOwnProviderInput(
  fieldName: string,
  inputSchema: NodeInputSchema,
  effectiveFillModes: Record<string, FieldFillMode>,
  source?: RuntimeInputSource
): boolean {
  const fieldDef = inputSchema[fieldName];
  if (fieldDef && isCredentialOwnership(fieldName, fieldDef) && source !== 'credential') {
    return false;
  }
  if (effectiveFillModes[fieldName] === 'runtime_ai') return true;
  return !!source && RUNTIME_AUTHORITY_SOURCES.has(source);
}

export function buildFinalProviderConfig(params: {
  baseConfig: Record<string, unknown>;
  finalResolvedInputs: Record<string, unknown>;
  inputSources: Record<string, RuntimeInputSource>;
  inputSchema: NodeInputSchema;
  effectiveFillModes: Record<string, FieldFillMode>;
  fieldPolicy?: ResolvedOperationFieldPolicy;
}): { config: Record<string, unknown>; appliedFields: string[] } {
  const config: Record<string, unknown> = { ...(params.baseConfig || {}) };
  const appliedFields: string[] = [];
  if (params.fieldPolicy) {
    for (const fieldName of params.fieldPolicy.inactiveFields) {
      delete config[fieldName];
    }
  }

  for (const [fieldName, value] of Object.entries(params.finalResolvedInputs || {})) {
    if (value === undefined) continue;
    if (params.fieldPolicy?.fields[fieldName]?.active === false) continue;
    const source = params.inputSources[fieldName];
    const shouldOwn = shouldResolvedValueOwnProviderInput(
      fieldName,
      params.inputSchema,
      params.effectiveFillModes,
      source
    );

    if (shouldOwn) {
      config[fieldName] = value;
      appliedFields.push(fieldName);
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(config, fieldName) || isRuntimeEmptyValue(config[fieldName])) {
      config[fieldName] = value;
      appliedFields.push(fieldName);
    }
  }

  return { config, appliedFields };
}

export function getAuthoritativeInputs(context: {
  finalResolvedInputs?: Record<string, any>;
  inputs?: Record<string, any>;
}): Record<string, any> {
  return (context.finalResolvedInputs || context.inputs || {}) as Record<string, any>;
}

export function mergeAuthoritativeInputs(context: {
  config?: Record<string, any>;
  inputs?: Record<string, any>;
  finalResolvedInputs?: Record<string, any>;
}): Record<string, any> {
  return {
    ...(context.config || {}),
    ...getAuthoritativeInputs(context),
  };
}

export function createProviderExecutionContext(context: {
  finalResolvedInputs?: Record<string, any>;
  inputs?: Record<string, any>;
  resolvedInputSources?: Record<string, RuntimeInputSource>;
  fieldContracts?: NodeInputSchema;
  operation?: string;
  credentials?: Record<string, unknown>;
  rawUpstreamInput?: unknown;
  lineageContext?: Record<string, unknown>;
  runtimeInputHandoffAudit?: RuntimeInputHandoffAudit[];
  operationContract?: NormalizedOperationContract;
}): ProviderExecutionContext {
  return {
    finalResolvedInputs: getAuthoritativeInputs(context),
    resolvedInputSources: context.resolvedInputSources || {},
    fieldContracts: context.fieldContracts,
    operationContract: context.operationContract,
    operation: context.operation,
    credentials: context.credentials,
    rawUpstreamInput: context.rawUpstreamInput,
    lineageContext: context.lineageContext,
    handoffAudit: context.runtimeInputHandoffAudit,
  };
}

export function validateRuntimeInputHandoff(params: {
  nodeId: string;
  nodeType: string;
  finalResolvedInputs: Record<string, unknown>;
  providerConfig: Record<string, unknown>;
  inputSources: Record<string, RuntimeInputSource>;
  inputSchema: NodeInputSchema;
  effectiveFillModes: Record<string, FieldFillMode>;
  operationContract?: NormalizedOperationContract;
  fieldPolicy?: ResolvedOperationFieldPolicy;
}): { valid: boolean; errors: string[]; audit: RuntimeInputHandoffAudit[] } {
  const errors: string[] = [];
  const audit: RuntimeInputHandoffAudit[] = [];

  for (const [fieldName, resolvedValue] of Object.entries(params.finalResolvedInputs || {})) {
    if (params.fieldPolicy?.fields[fieldName]?.active === false) {
      audit.push({
        nodeId: params.nodeId,
        nodeType: params.nodeType,
        fieldName,
        ownership: ownershipFor(fieldName, params.inputSchema, params.effectiveFillModes),
        expectedRole: params.inputSchema[fieldName]?.runtimeContract?.role || params.inputSchema[fieldName]?.role,
        resolvedSource: params.inputSources[fieldName],
        resolvedValuePreview: preview(fieldName, resolvedValue),
        finalProviderValuePreview: undefined,
        validationStatus: 'valid',
        handoffStatus: 'not_applicable',
      });
      continue;
    }
    const source = params.inputSources[fieldName];
    const ownership = ownershipFor(fieldName, params.inputSchema, params.effectiveFillModes);
    const providerValue = params.providerConfig[fieldName];
    const shouldOwn = shouldResolvedValueOwnProviderInput(
      fieldName,
      params.inputSchema,
      params.effectiveFillModes,
      source
    );

    let handoffStatus: RuntimeInputHandoffAudit['handoffStatus'] = 'not_applicable';
    let blockedReason: string | undefined;

    if (shouldOwn) {
      if (isRuntimeEmptyValue(providerValue)) {
        if (params.operationContract && fieldAllowsEmptyValue(params.operationContract, fieldName)) {
          handoffStatus = 'accepted_empty_provider_default';
        } else {
          handoffStatus = 'missing';
          blockedReason = `Runtime handoff failed: ${fieldName} was resolved from ${source || ownership} but was not delivered to provider.`;
        }
      } else if (!isEqual(resolvedValue, providerValue)) {
        handoffStatus = 'mismatch';
        blockedReason = `Runtime handoff failed: ${fieldName} was resolved from ${source || ownership} but provider received a different value.`;
      } else {
        handoffStatus = 'delivered';
      }
    }

    if (blockedReason) errors.push(blockedReason);

    audit.push({
      nodeId: params.nodeId,
      nodeType: params.nodeType,
      fieldName,
      ownership,
      expectedRole: params.inputSchema[fieldName]?.runtimeContract?.role || params.inputSchema[fieldName]?.role,
      resolvedSource: source,
      resolvedValuePreview: preview(fieldName, resolvedValue),
      finalProviderValuePreview: preview(fieldName, providerValue),
      validationStatus: blockedReason ? 'invalid' : 'valid',
      handoffStatus,
      blockedReason,
    });
  }

  return { valid: errors.length === 0, errors, audit };
}
