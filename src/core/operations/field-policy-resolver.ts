import type {
  FieldFillMode,
  NodeInputField,
  NodeInputSchema,
  UnifiedNodeDefinition,
} from '../types/unified-node-contract';
import {
  fieldAllowsEmptyValue,
  fieldIsActiveForOperation,
  resolveOperationContract,
  type NormalizedOperationContract,
} from './operation-contract-resolver';
import { isCredentialOwnership } from '../utils/field-ownership';

export interface ResolvedOperationFieldPolicyEntry {
  active: boolean;
  required: boolean;
  allowsEmpty: boolean;
  runtimeAiAllowed: boolean;
  buildtimeAiAllowed: boolean;
  providerOwned: boolean;
  credential: boolean;
  reason: string;
}

export interface ResolvedOperationFieldPolicy {
  operation: string;
  resource?: string;
  activeFields: string[];
  requiredFields: string[];
  optionalFields: string[];
  inactiveFields: string[];
  providerDefaultFields: string[];
  credentialFields: string[];
  diagnostics: string[];
  fields: Record<string, ResolvedOperationFieldPolicyEntry>;
  operationContract: NormalizedOperationContract;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return expected.some((candidate) => valuesEqual(actual, candidate));
  return actual === expected;
}

function conditionMatches(
  condition: { field: string; equals?: unknown; notEquals?: unknown } | undefined,
  config: Record<string, unknown>
): boolean {
  if (!condition) return true;
  const value = config[condition.field];
  if ('equals' in condition) return valuesEqual(value, condition.equals);
  if ('notEquals' in condition) return !valuesEqual(value, condition.notEquals);
  return true;
}

function recordConditionMatches(when: Record<string, unknown> | undefined, config: Record<string, unknown>): boolean {
  if (!when || Object.keys(when).length === 0) return true;
  return Object.entries(when).every(([fieldName, expected]) => valuesEqual(config[fieldName], expected));
}

function requiredByResolvedContract(
  contract: NormalizedOperationContract,
  fieldName: string,
  config: Record<string, unknown>
): boolean {
  if (contract.requiredFields.includes(fieldName)) return true;
  return contract.conditionallyRequiredFields.some(
    (condition) => condition.field === fieldName && recordConditionMatches(condition.when, config)
  );
}

function isRequiredWhenMatched(field: NodeInputField, config: Record<string, unknown>): boolean {
  if (field.ui?.requiredIf) return conditionMatches(field.ui.requiredIf, config);
  if (Array.isArray(field.runtimeContract?.requiredWhen) && field.runtimeContract.requiredWhen.length > 0) {
    return field.runtimeContract.requiredWhen.some((condition) => conditionMatches(condition, config));
  }
  return field.required === true;
}

function hasInactiveRequiredCondition(field: NodeInputField, config: Record<string, unknown>): boolean {
  if (field.ui?.requiredIf && !conditionMatches(field.ui.requiredIf, config)) return true;
  if (Array.isArray(field.runtimeContract?.requiredWhen) && field.runtimeContract.requiredWhen.length > 0) {
    return !field.runtimeContract.requiredWhen.some((condition) => conditionMatches(condition, config));
  }
  return false;
}

function activeByFieldConditions(
  fieldName: string,
  field: NodeInputField,
  contract: NormalizedOperationContract,
  config: Record<string, unknown>
): { active: boolean; reason?: string } {
  if (field.ui?.visibleIf && !conditionMatches(field.ui.visibleIf, config)) {
    return { active: false, reason: `hidden_by_visibleIf:${field.ui.visibleIf.field}` };
  }

  if (!fieldIsActiveForOperation(contract, fieldName)) {
    return { active: false, reason: `inactive_for_operation:${contract.operation}` };
  }

  if (
    contract.generated &&
    fieldName !== 'operation' &&
    fieldName !== 'resource' &&
    hasInactiveRequiredCondition(field, config)
  ) {
    return { active: false, reason: `inactive_required_condition:${contract.operation}` };
  }

  return { active: true };
}

export function pickActiveInputSchema(
  inputSchema: NodeInputSchema,
  fieldPolicy: ResolvedOperationFieldPolicy
): NodeInputSchema {
  const picked: NodeInputSchema = {};
  for (const fieldName of fieldPolicy.activeFields) {
    if (inputSchema[fieldName]) picked[fieldName] = inputSchema[fieldName];
  }
  return picked;
}

export function resolveFieldPolicyForNode(
  def: UnifiedNodeDefinition,
  config: Record<string, unknown>,
  effectiveFillModes: Record<string, FieldFillMode> = {}
): ResolvedOperationFieldPolicy {
  const inputSchema = def.inputSchema || {};
  const operationContract = resolveOperationContract(def, config);
  const fields: ResolvedOperationFieldPolicy['fields'] = {};

  for (const [fieldName, field] of Object.entries(inputSchema)) {
    const condition = activeByFieldConditions(fieldName, field, operationContract, config);
    const credential = isCredentialOwnership(fieldName, field);
    const active = condition.active || credential;
    const allowsEmpty =
      active &&
      (fieldAllowsEmptyValue(operationContract, fieldName) ||
        field.runtimeContract?.validation?.allowEmpty === true ||
        operationContract.emptyValuePolicy[fieldName] === 'optional' ||
        operationContract.emptyValuePolicy[fieldName] === 'allow_empty');
    const required =
      active &&
      !allowsEmpty &&
      (requiredByResolvedContract(operationContract, fieldName, config) ||
        isRequiredWhenMatched(field, config));
    const sourcePolicy = operationContract.fieldSourcePolicy[fieldName] || field.runtimeContract?.sourcePolicy;
    const runtimeAiPolicy = operationContract.runtimeAiPolicy[fieldName];
    const protectedField =
      credential ||
      field.runtimeContract?.protected === true ||
      sourcePolicy?.manualOnly === true ||
      sourcePolicy?.systemOnly === true;
    const mode = effectiveFillModes[fieldName] || field.fillMode?.default || 'manual_static';
    const runtimeAiAllowed =
      active &&
      !protectedField &&
      runtimeAiPolicy?.allowed !== false &&
      field.runtimeContract?.aiGeneratable !== false &&
      field.fillMode?.supportsRuntimeAI !== false &&
      (mode === 'runtime_ai' || field.fillMode?.supportsRuntimeAI === true);
    const buildtimeAiAllowed =
      active &&
      !protectedField &&
      field.fillMode?.supportsBuildtimeAI !== false &&
      (mode === 'buildtime_ai_once' || field.fillMode?.supportsBuildtimeAI === true);

    fields[fieldName] = {
      active,
      required,
      allowsEmpty,
      runtimeAiAllowed,
      buildtimeAiAllowed,
      providerOwned: active && !credential && sourcePolicy?.systemOnly !== true,
      credential,
      reason: condition.reason || (operationContract.generated ? 'generated_contract' : `operation_contract:${operationContract.operation}`),
    };
  }

  const activeFields = Object.keys(fields).filter((fieldName) => fields[fieldName].active);
  const requiredFields = activeFields.filter((fieldName) => fields[fieldName].required);
  const providerDefaultFields = activeFields.filter((fieldName) => fields[fieldName].allowsEmpty);
  const credentialFields = activeFields.filter((fieldName) => fields[fieldName].credential);
  const optionalFields = activeFields.filter(
    (fieldName) => !fields[fieldName].required && !credentialFields.includes(fieldName)
  );
  const inactiveFields = Object.keys(fields).filter((fieldName) => !fields[fieldName].active);

  return {
    operation: operationContract.operation,
    resource: operationContract.resource,
    activeFields,
    requiredFields,
    optionalFields,
    inactiveFields,
    providerDefaultFields,
    credentialFields,
    diagnostics: operationContract.diagnostics || [],
    fields,
    operationContract,
  };
}
