/**
 * INPUT GUARANTEE
 *
 * Ensures every node receives schema-valid, complete input: required fields present,
 * types correct. Uses strict validation and deterministic completion from previous
 * node output (metadata, exact key, KEY_ALIASES) so output is guaranteed even when
 * AI fails or returns incomplete JSON.
 */

import type { NodeInputSchema, NodeInputField, FieldFillMode } from '../types/unified-node-contract';
import { convertToType, type FieldType } from '../utils/type-converter';
import { isStructuralOwnership } from '../utils/field-ownership';

/** Key aliases: expected key -> candidate keys in previous output (same as runtime-input-adapter). */
const KEY_ALIASES: Record<string, string[]> = {
  number: ['num', 'number', 'value', 'n', 'inputData', 'input'],
  num: ['number', 'num', 'value'],
  age: ['age', 'userAge', 'user_age', 'years'],
  userAge: ['age', 'userAge'],
  value: ['value', 'number', 'num', 'inputData', 'data'],
  inputData: ['inputData', 'data', 'value', 'number', 'json'],
  message: ['message', 'text', 'body', 'content', 'msg'],
  text: ['message', 'text', 'body', 'content'],
  body: ['body', 'message', 'text', 'content'],
  name: ['name', 'username', 'userName', 'fullName'],
  email: ['email', 'mail', 'emailAddress'],
  result: ['result', 'output', 'response', 'data'],
  output: ['output', 'result', 'response'],
  response: ['response', 'result', 'output', 'body'],
  subject: ['title', 'heading', 'subjectLine', 'emailSubject', 'summary'],
  title: ['subject', 'heading', 'emailSubject'],
};

function getCandidateActualKeys(expectedKey: string): string[] {
  const lower = expectedKey.toLowerCase();
  const candidates: string[] = [expectedKey];
  for (const [canon, aliases] of Object.entries(KEY_ALIASES)) {
    if (canon === expectedKey || aliases.includes(expectedKey)) {
      candidates.push(canon, ...aliases);
    }
    if (aliases.some(a => a.toLowerCase() === lower)) {
      candidates.push(canon, ...aliases);
    }
  }
  return [...new Set(candidates)];
}

function getValueType(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function isTypeCompatible(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  if (expected === 'string') return true;
  if (expected === 'number' && (actual === 'string' || actual === 'number')) return true;
  if (expected === 'boolean' && (actual === 'string' || actual === 'number' || actual === 'boolean')) return true;
  if (expected === 'object' && actual === 'object') return true;
  if (expected === 'array' && actual === 'array') return true;
  if (expected === 'json' && (actual === 'object' || actual === 'array')) return true;
  return false;
}

export interface GuaranteeInputOptions {
  resolved: Record<string, any>;
  previousOutput: unknown;
  inputSchema: NodeInputSchema;
  requiredInputs: string[];
  mappingMetadata?: Record<string, { selectedUpstreamKey?: string }>;
  /**
   * Optional per-field fill mode map. When provided, fields explicitly marked as
   * manual_static will NOT be auto-filled from previous output or defaults – they
   * must be supplied by the user/config. This keeps runtime AI/guarantee logic
   * aligned with UI/registry-driven fill mode choices.
   */
  fieldFillModes?: Record<string, FieldFillMode>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that resolved object has all required fields with correct types.
 */
export function validateResolvedInput(
  resolved: Record<string, any>,
  inputSchema: NodeInputSchema,
  requiredInputs: string[]
): ValidationResult {
  const errors: string[] = [];
  for (const fieldName of requiredInputs) {
    const fieldDef = inputSchema[fieldName];
    if (!fieldDef) continue;
    const value = resolved[fieldName];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      errors.push(`Required field '${fieldName}' is missing or empty`);
      continue;
    }
    const actualType = getValueType(value);
    const expectedType = (fieldDef.type || 'string') as string;
    if (!isTypeCompatible(actualType, expectedType)) {
      errors.push(`Field '${fieldName}' has wrong type: ${actualType}, expected ${expectedType}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Fill missing or wrong-type fields from previous output using metadata, exact key, then KEY_ALIASES; coerce to schema type.
 * Returns a new object that has every required field set and types aligned to the schema.
 */
export function guaranteeInputForSchema(options: GuaranteeInputOptions): Record<string, any> {
  const { resolved, previousOutput, inputSchema, requiredInputs, mappingMetadata, fieldFillModes } = options;
  const prev = previousOutput != null && typeof previousOutput === 'object' ? (previousOutput as Record<string, unknown>) : {};
  const out = { ...resolved };

  const schemaKeys = Object.keys(inputSchema);
  const fieldsToEnsure = [...new Set([...requiredInputs, ...schemaKeys])];

  for (const fieldName of fieldsToEnsure) {
    const fieldDef = inputSchema[fieldName] as NodeInputField | undefined;
    if (!fieldDef) continue;

    const current = out[fieldName];
    const expectedType = (fieldDef.type || 'string') as FieldType;
    const needFill =
      current === undefined ||
      current === null ||
      (typeof current === 'string' && current.trim() === '') ||
      !isTypeCompatible(getValueType(current), fieldDef.type || 'string');
    const structuralField = isStructuralOwnership(fieldName, fieldDef);

    // If field already has a usable value, just coerce to expected type.
    if (!needFill) {
      const coerced = coerce(current, expectedType, fieldName);
      if (coerced !== undefined) out[fieldName] = coerced;
      continue;
    }

    // Respect explicit manual_static fill modes: do NOT auto-fill these fields
    // from previous output or defaults. They must be supplied externally.
    if (fieldFillModes && fieldFillModes[fieldName] === 'manual_static') {
      continue;
    }

    // Title-like fields: derive a short line from upstream AI plain-text `response` when present.
    if (
      fieldDef.role === 'title_like' &&
      typeof prev.response === 'string' &&
      prev.response.trim().length > 0
    ) {
      const line = prev.response.split(/\r?\n/)[0]?.trim().slice(0, 100) ?? '';
      if (line.length > 0) {
        const coercedTitle = coerce(line, expectedType, fieldName);
        if (coercedTitle !== undefined) {
          out[fieldName] = coercedTitle;
          continue;
        }
      }
    }

    let value: unknown = undefined;

    if (mappingMetadata?.[fieldName]?.selectedUpstreamKey) {
      const key = mappingMetadata[fieldName].selectedUpstreamKey!;
      value = prev[key];
    }
    if (value === undefined && prev[fieldName] !== undefined) {
      value = prev[fieldName];
    }
    if (value === undefined) {
      const candidates = getCandidateActualKeys(fieldName);
      for (const c of candidates) {
        if (prev[c] !== undefined) {
          value = prev[c];
          break;
        }
      }
    }
    if (value === undefined && fieldDef.default !== undefined) {
      value = fieldDef.default;
    }
    if (value === undefined && !structuralField) {
      value = getSchemaTypeFallback(fieldDef);
    }

    const coerced = value !== undefined ? coerce(value, expectedType, fieldName) : undefined;
    if (coerced !== undefined) {
      out[fieldName] = coerced;
    }
  }

  return out;
}

function coerce(value: unknown, expectedType: FieldType, fieldName: string): unknown {
  const result = convertToType(value, expectedType, fieldName);
  return result.success ? result.value : value;
}

function getSchemaTypeFallback(fieldDef: NodeInputField): unknown {
  const expectedType = (fieldDef.type || 'string') as FieldType;
  if (expectedType === 'array') {
    return [];
  }
  if (expectedType === 'object' || expectedType === 'json') {
    return {};
  }
  if (expectedType === 'number') return 0;
  if (expectedType === 'boolean') return false;
  return '';
}
