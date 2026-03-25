/**
 * RUNTIME INPUT ADAPTER
 *
 * Real-time, key-value-driven adaptation so node properties and code inputs
 * are derived from the actual upstream payload at execution time.
 *
 * - Normalizes payload: maps actual keys to expected keys (e.g. num → number)
 *   so templates and code see a consistent shape ($json.number works even when
 *   payload has "num").
 * - Produces a keyMap for key-aware input binding and UI.
 */

import type { EffectiveOutputSchema } from '../types/unified-node-contract';

export interface RuntimeNormalizerInput {
  /** Actual upstream payload (object). */
  payload: unknown;
  /**
   * Expected keys the downstream node expects (e.g. from EffectiveOutputSchema
   * or _expectedInputKeys on node config).
   */
  expectedKeys?: string[];
  /**
   * Expected shape from upstream node's effective output schema.
   * If provided, expectedKeys can be derived from properties.
   */
  expectedSchema?: EffectiveOutputSchema;
}

export interface RuntimeNormalizerResult {
  /** Payload with expected keys populated from actual keys (alias-aware). */
  normalizedPayload: Record<string, unknown>;
  /** Map actualKey → expectedKey for UI/debugging and key-aware binding. */
  keyMap: Record<string, string>;
  /** Whether any normalization was applied. */
  normalized: boolean;
}

/**
 * Deterministic key aliases: actual key → possible expected keys.
 * Used to fill expected keys from payload when names differ slightly.
 */
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
};

/**
 * For a given expected key, return candidate actual keys to look for in payload (order of preference).
 */
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

/**
 * Get expected keys from input (explicit list or from schema properties).
 */
function resolveExpectedKeys(input: RuntimeNormalizerInput): string[] {
  if (input.expectedKeys && input.expectedKeys.length > 0) {
    return input.expectedKeys;
  }
  if (input.expectedSchema?.properties && typeof input.expectedSchema.properties === 'object') {
    return Object.keys(input.expectedSchema.properties);
  }
  return [];
}

/**
 * Normalize upstream payload so downstream node sees expected keys.
 * Uses key aliases and actual payload keys; does not mutate original payload.
 */
export function normalizeRuntimePayload(input: RuntimeNormalizerInput): RuntimeNormalizerResult {
  const expectedKeys = resolveExpectedKeys(input);
  const keyMap: Record<string, string> = {};
  let normalized = false;

  if (input.payload == null || typeof input.payload !== 'object') {
    return {
      normalizedPayload: typeof input.payload === 'object' && input.payload !== null
        ? { ...(input.payload as Record<string, unknown>) }
        : {},
      keyMap: {},
      normalized: false,
    };
  }

  const payload = input.payload as Record<string, unknown>;
  const actualKeys = Object.keys(payload);
  const normalizedPayload: Record<string, unknown> = { ...payload };

  for (const expectedKey of expectedKeys) {
    if (payload[expectedKey] !== undefined && payload[expectedKey] !== null) {
      continue;
    }
    const candidates = getCandidateActualKeys(expectedKey);
    for (const candidate of candidates) {
      if (payload[candidate] !== undefined) {
        normalizedPayload[expectedKey] = payload[candidate];
        keyMap[candidate] = expectedKey;
        normalized = true;
        break;
      }
    }
  }

  // Heuristic: if no expected keys but payload has a single numeric field, treat it as "number"
  if (expectedKeys.length === 0 && actualKeys.length > 0) {
    const numericKey = actualKeys.find(k => {
      const v = payload[k];
      return typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v));
    });
    if (numericKey && actualKeys.length <= 2) {
      normalizedPayload.number = payload[numericKey];
      keyMap[numericKey] = 'number';
      normalized = true;
    }
  }

  return {
    normalizedPayload: normalizedPayload as Record<string, unknown>,
    keyMap,
    normalized,
  };
}
