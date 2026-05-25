import type {
  FieldFillMode,
  NodeInputField,
  NodeInputSchema,
  RuntimeInputSource,
  RuntimeRepairStrategy,
  RuntimeValidationFormat,
} from '../types/unified-node-contract';
import { normalizeGoogleSheetsWriteValues } from '../../shared/google-sheets-write-values';
import { extractEmailsFromText, parseRecipientEmails } from '../utils/recipient-resolver';

export interface RuntimeLineageContext {
  upstreamPayload: unknown;
  allOutputs?: Record<string, unknown>;
  workflowIntent?: string;
}

export interface RuntimeFieldValidationContext extends RuntimeLineageContext {
  inputSchema: NodeInputSchema;
  config: Record<string, unknown>;
  effectiveFillModes: Record<string, FieldFillMode>;
}

export interface RuntimeFieldAuditEntry {
  field: string;
  fillMode: FieldFillMode;
  source?: RuntimeInputSource;
  valid: boolean;
  repaired: boolean;
  errors: string[];
  preview: unknown;
}

export interface RuntimeFieldContractResult {
  resolvedInputs: Record<string, unknown>;
  inputSources: Record<string, RuntimeInputSource>;
  repairs: string[];
  warnings: string[];
  errors: string[];
  audit: RuntimeFieldAuditEntry[];
}

const EMAIL_FIELD_RE = /(email|e-mail|gmail|recipient|to)$/i;
const PLACEHOLDER_TEXT_RE =
  /\{\{[^}]+\}\}|\[insert\b|\[add\b|\[fill\b|\[enter\b|\[.*here\]|not configured|filled automatically|to be generated|will be generated|placeholder/i;
const A1_RANGE_RE =
  /^(?:[A-Za-z]+\d+(?::[A-Za-z]+\d+)?|[A-Za-z]+(?::[A-Za-z]+)?|\d+(?::\d+)?)$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function preview(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  if (Array.isArray(value)) return value.length > 5 ? [...value.slice(0, 5), `... ${value.length - 5} more`] : value;
  if (isPlainObject(value)) {
    const entries = Object.entries(value).slice(0, 12);
    const out = Object.fromEntries(entries);
    const rest = Object.keys(value).length - entries.length;
    if (rest > 0) out.__truncatedKeys = rest;
    return out;
  }
  return value;
}

export function isRuntimeEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.length <= 80 && trimmed.toLowerCase() === 'v') return true;
    return PLACEHOLDER_TEXT_RE.test(trimmed);
  }
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function conditionMatches(
  condition: { field: string; equals?: unknown; notEquals?: unknown },
  resolved: Record<string, unknown>,
  config: Record<string, unknown>
): boolean {
  const value = resolved[condition.field] ?? config[condition.field];
  if ('equals' in condition) return value === condition.equals;
  if ('notEquals' in condition) return value !== condition.notEquals;
  return true;
}

function fieldRequiredByContract(
  fieldName: string,
  fieldDef: NodeInputField,
  resolved: Record<string, unknown>,
  config: Record<string, unknown>
): boolean {
  if (fieldDef.required) return true;
  const uiRequired = fieldDef.ui?.requiredIf;
  if (uiRequired && conditionMatches(uiRequired, resolved, config)) return true;
  const contractRequired = fieldDef.runtimeContract?.requiredWhen;
  return Array.isArray(contractRequired) && contractRequired.some((c) => conditionMatches(c, resolved, config));
}

function groupSatisfied(
  fieldName: string,
  fieldDef: NodeInputField,
  resolved: Record<string, unknown>,
  inputSchema: NodeInputSchema
): boolean {
  const group = fieldDef.runtimeContract?.requiredGroup;
  if (!group) return false;
  return Object.entries(inputSchema).some(([otherField, otherDef]) => {
    if (otherField === fieldName) return false;
    return otherDef.runtimeContract?.requiredGroup === group && !isRuntimeEmptyValue(resolved[otherField]);
  });
}

function fieldFormats(fieldDef: NodeInputField): RuntimeValidationFormat[] {
  const validation = fieldDef.runtimeContract?.validation;
  return [
    ...(validation?.format ? [validation.format] : []),
    ...(Array.isArray(validation?.formats) ? validation.formats : []),
  ];
}

function isValidA1Range(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const rangePart = trimmed.includes('!') ? trimmed.split('!').pop() || '' : trimmed;
  return A1_RANGE_RE.test(rangePart.trim());
}

function isRows(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.some((row) =>
      Array.isArray(row)
        ? row.some((cell) => !isRuntimeEmptyValue(cell))
        : !isRuntimeEmptyValue(row)
    )
  );
}

function isValidConditions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((condition) => {
      if (!isPlainObject(condition)) return false;
      return (
        typeof condition.field === 'string' &&
        condition.field.trim().length > 0 &&
        typeof condition.operator === 'string' &&
        condition.operator.trim().length > 0 &&
        Object.prototype.hasOwnProperty.call(condition, 'value')
      );
    })
  );
}

function isValidSwitchCases(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => {
      if (!isPlainObject(item)) return false;
      return !isRuntimeEmptyValue(item.value);
    })
  );
}

function validateFormat(value: unknown, format: RuntimeValidationFormat): string | undefined {
  if (format === 'non_empty' && isRuntimeEmptyValue(value)) return 'value is empty';
  if (format === 'email_list' && parseRecipientEmails(value).length === 0) return 'no valid email address found';
  if (format === 'a1_range' && !isValidA1Range(value)) return 'range must be blank or valid A1 notation';
  if (format === 'row_values' && !isRows(value)) return 'row values must be a non-empty array';
  if (format === 'object_payload' && (!isPlainObject(value) || Object.keys(value).length === 0)) return 'object payload is empty';
  if (format === 'conditions' && !isValidConditions(value)) return 'conditions must be non-empty rules with field, operator, and value';
  if (format === 'switch_cases' && !isValidSwitchCases(value)) return 'switch cases must be non-empty objects with value';
  if (format === 'code' && (typeof value !== 'string' || value.trim().length < 10)) return 'code is missing or too short';
  return undefined;
}

function flattenValues(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 5 || value === undefined || value === null) return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenValues(item, out, depth + 1);
    return out;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) flattenValues(item, out, depth + 1);
  }
  return out;
}

function extractEmailsFromLineage(context: RuntimeLineageContext): string[] {
  const textParts = [
    context.workflowIntent || '',
    ...flattenValues(context.upstreamPayload),
    ...flattenValues(context.allOutputs || {}),
  ];
  const emails = textParts.flatMap((part) => extractEmailsFromText(part));
  return Array.from(new Set(emails));
}

function repairField(params: {
  fieldName: string;
  fieldDef: NodeInputField;
  resolved: Record<string, unknown>;
  context: RuntimeFieldValidationContext;
}): { value: unknown; repaired: boolean; repairs: string[]; warnings: string[] } {
  const { fieldName, fieldDef, resolved, context } = params;
  const strategies = fieldDef.runtimeContract?.repair || [];
  const repairs: string[] = [];
  const warnings: string[] = [];
  let value = resolved[fieldName];

  for (const strategy of strategies) {
    if (strategy === 'extract_email' && isRuntimeEmptyValue(value)) {
      const emails = extractEmailsFromLineage(context);
      if (emails.length > 0) {
        value = emails;
        repairs.push(`${fieldName} repaired from lineage email detection`);
      }
    }

    if (strategy === 'object_to_row_values' && !isRows(value)) {
      const rows = normalizeGoogleSheetsWriteValues({
        values: value,
        data: resolved.data,
        fallbackInput: context.upstreamPayload,
      });
      if (rows.length > 0) {
        value = rows;
        repairs.push(`${fieldName} repaired by converting object payload to row values`);
      }
    }

    if (strategy === 'clear_invalid_optional') {
      const invalid = fieldFormats(fieldDef)
        .map((format) => validateFormat(value, format))
        .some(Boolean);
      const required = fieldRequiredByContract(fieldName, fieldDef, resolved, context.config);
      if (invalid && !required) {
        value = '';
        repairs.push(`${fieldName} cleared because optional value was invalid`);
      } else if (invalid) {
        warnings.push(`${fieldName} is invalid and cannot be cleared because it is required`);
      }
    }

    if (strategy === 'derive_title' && isRuntimeEmptyValue(value)) {
      const source = String(resolved.body || resolved.message || resolved.text || context.workflowIntent || '').trim();
      if (source) {
        value = source.split(/\r?\n/)[0].replace(/\s+/g, ' ').slice(0, 100);
        repairs.push(`${fieldName} derived from body/message/intent`);
      }
    }

    if (strategy === 'derive_body' && isRuntimeEmptyValue(value)) {
      const name = flattenValues(context.upstreamPayload).find((part) => part.length > 2 && !part.includes('@'));
      const intent = context.workflowIntent || 'your workflow submission';
      value = name ? `Hi ${name},\n\n${intent}` : intent;
      repairs.push(`${fieldName} derived from workflow intent`);
    }

    if (strategy === 'derive_condition' && isRuntimeEmptyValue(value)) {
      const intent = (context.workflowIntent || '').toLowerCase();
      const payload = isPlainObject(context.upstreamPayload) ? context.upstreamPayload : {};
      const ageKey = Object.keys(payload).find((k) => k.toLowerCase().includes('age'));
      if (ageKey && /\b(18|adult|greater|above|eligible)\b/.test(intent)) {
        value = [{ field: `$json.${ageKey}`, operator: 'greater_than_or_equal', value: 18 }];
        repairs.push(`${fieldName} derived from intent and upstream age field`);
      }
    }
  }

  return { value, repaired: repairs.length > 0, repairs, warnings };
}

function fieldHasInvalidExample(value: unknown, fieldDef: NodeInputField): boolean {
  const examples = fieldDef.runtimeContract?.invalidExamples || [];
  return examples.some((example) => JSON.stringify(example) === JSON.stringify(value));
}

function formatDefault(fieldName: string, fieldDef: NodeInputField): RuntimeValidationFormat | undefined {
  const lower = fieldName.toLowerCase();
  const type = String(fieldDef.type || '').toLowerCase();
  const emailAddressLike =
    lower === 'to' ||
    lower.endsWith('email') ||
    lower.endsWith('emails') ||
    lower.endsWith('emailaddress') ||
    lower.endsWith('emailaddresses') ||
    EMAIL_FIELD_RE.test(lower);
  const canHoldEmailValue = ['string', 'array', 'json'].includes(type) || !type;
  if (canHoldEmailValue && emailAddressLike) return 'email_list';
  if (lower.includes('range')) return 'a1_range';
  if (lower === 'conditions') return 'conditions';
  if (lower === 'cases') return 'switch_cases';
  if (lower === 'code') return 'code';
  return undefined;
}

export function enforceRuntimeFieldContracts(
  resolvedInputs: Record<string, unknown>,
  inputSources: Record<string, RuntimeInputSource>,
  context: RuntimeFieldValidationContext
): RuntimeFieldContractResult {
  const resolved = { ...resolvedInputs };
  const sources: Record<string, RuntimeInputSource> = { ...inputSources };
  const repairs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const audit: RuntimeFieldAuditEntry[] = [];

  for (const [fieldName, fieldDef] of Object.entries(context.inputSchema || {})) {
    const fillMode = context.effectiveFillModes[fieldName] || 'manual_static';
    const source = sources[fieldName];
    const required = fieldRequiredByContract(fieldName, fieldDef, resolved, context.config);
    const allowEmpty = fieldDef.runtimeContract?.validation?.allowEmpty === true;
    const protectedField = fieldDef.runtimeContract?.protected === true || fieldDef.ownership === 'credential';

    if (protectedField && source === 'runtime_ai') {
      errors.push(`${fieldName}: runtime AI cannot generate protected field`);
    }

    const repair = repairField({ fieldName, fieldDef, resolved, context });
    if (repair.repaired) {
      resolved[fieldName] = repair.value;
      sources[fieldName] = 'deterministic_runtime';
      repairs.push(...repair.repairs);
    }
    warnings.push(...repair.warnings);

    const value = resolved[fieldName];
    const fieldErrors: string[] = [];
    const empty = isRuntimeEmptyValue(value) || fieldHasInvalidExample(value, fieldDef);
    if (empty && required && !allowEmpty && !groupSatisfied(fieldName, fieldDef, resolved, context.inputSchema)) {
      fieldErrors.push(`${fieldName} is required but empty or placeholder-like`);
    }

    const formats = [...fieldFormats(fieldDef)];
    const inferred = formatDefault(fieldName, fieldDef);
    if (inferred && !formats.includes(inferred)) formats.push(inferred);
    if (!empty || required) {
      for (const format of formats) {
        const formatError = validateFormat(value, format);
        if (formatError && !(allowEmpty && empty)) {
          if (groupSatisfied(fieldName, fieldDef, resolved, context.inputSchema)) continue;
          fieldErrors.push(`${fieldName}: ${formatError}`);
        }
      }
    }

    errors.push(...fieldErrors);
    audit.push({
      field: fieldName,
      fillMode,
      source,
      valid: fieldErrors.length === 0,
      repaired: repair.repaired,
      errors: fieldErrors,
      preview: preview(value),
    });
  }

  return { resolvedInputs: resolved, inputSources: sources, repairs, warnings, errors, audit };
}
