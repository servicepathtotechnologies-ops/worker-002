/**
 * Universal attach-inputs merge rules (registry + fill mode).
 * Prevents client/UI from overwriting richer build-time AI values with partial defaults
 * (e.g. truncated `fields` arrays) — applies to any node type, not one-off fixes per node.
 */

import type { NodeInputField, NodeInputSchema } from '../types/unified-node-contract';
import { resolveEffectiveFieldFillMode } from './fill-mode-resolver';

const CONFIG_META_KEYS = new Set(['_fillMode', '_ownershipUnlock', '_fieldEnabled']);

export function isConfigMetaKey(fieldName: string): boolean {
  return CONFIG_META_KEYS.has(fieldName);
}

/**
 * When effective fill mode is buildtime_ai_once, reject incoming values that are clearly
 * "weaker" than what is already stored (smaller arrays, emptier objects).
 * User switching to manual_static in UI will change fill mode first, then edits apply.
 *
 * STRUCTURAL_BRANCH_FIELDS: switch `cases` and `rules` are exempt from array-shrink
 * protection because the user may legitimately reduce the number of switch branches.
 * `conditions` is NOT exempt — an empty incoming conditions array from the wizard
 * must not wipe an AI-built conditions value.
 */
const STRUCTURAL_BRANCH_FIELDS = new Set(['cases', 'rules']);

/** Returns true if the incoming value is empty/blank/default and should not overwrite an existing AI-built value. */
function isEmptyIncomingValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return true;
  return false;
}

export function shouldPreserveExistingBuildtimeValue(
  fieldName: string,
  inputSchema: NodeInputSchema | undefined,
  config: Record<string, unknown>,
  existingValue: unknown,
  incomingValue: unknown
): { preserve: boolean; reason?: string } {
  if (isConfigMetaKey(fieldName)) {
    return { preserve: false };
  }

  // Switch branch fields (cases/rules): allow user to reduce branch count freely.
  // conditions is NOT in this set — empty incoming conditions must not wipe AI-built value.
  if (STRUCTURAL_BRANCH_FIELDS.has(fieldName)) {
    return { preserve: false };
  }

  const mode = resolveEffectiveFieldFillMode(fieldName, inputSchema, config as Record<string, any>);
  if (mode !== 'buildtime_ai_once') {
    return { preserve: false };
  }

  if (incomingValue === undefined) {
    return { preserve: false };
  }

  // ✅ FIX: If the existing value is non-empty and the incoming value is empty/blank,
  // preserve the AI-built value. This is the universal guard that prevents the wizard
  // from wiping AI-assigned values when the user hasn't explicitly changed the field.
  const existingIsNonEmpty = !isEmptyIncomingValue(existingValue);
  if (existingIsNonEmpty && isEmptyIncomingValue(incomingValue)) {
    return {
      preserve: true,
      reason: 'buildtime_empty_incoming_blocked',
    };
  }

  // Arrays: do not allow shrinking a populated AI-built list with a shorter client snapshot.
  if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
    if (existingValue.length > 0 && incomingValue.length < existingValue.length) {
      return {
        preserve: true,
        reason: 'buildtime_array_shrink_blocked',
      };
    }
  }

  // Objects (e.g. JSON configs): avoid replacing rich object with near-empty object
  if (
    existingValue &&
    typeof existingValue === 'object' &&
    !Array.isArray(existingValue) &&
    incomingValue &&
    typeof incomingValue === 'object' &&
    !Array.isArray(incomingValue)
  ) {
    const ek = Object.keys(existingValue as object).length;
    const ik = Object.keys(incomingValue as object).length;
    if (ek >= 3 && ik > 0 && ik < ek / 2) {
      return {
        preserve: true,
        reason: 'buildtime_object_shrink_blocked',
      };
    }
  }

  return { preserve: false };
}

/**
 * If schema marks `fieldName` as an alias of another field, return the canonical name.
 */
export function resolveAliasTargetFieldName(fieldName: string, fieldDef: NodeInputField | undefined): string | null {
  if (!fieldDef?.aliasOf || typeof fieldDef.aliasOf !== 'string') {
    return null;
  }
  const target = fieldDef.aliasOf.trim();
  if (!target || target === fieldName) {
    return null;
  }
  return target;
}
