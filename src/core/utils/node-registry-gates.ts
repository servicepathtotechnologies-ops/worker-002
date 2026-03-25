/**
 * Automated registry invariants (CI gates). Single source: unifiedNodeRegistry.
 * Violations must be fixed in unified-node-registry / overrides, not silenced in feature code.
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import type { NodeInputField } from '../types/unified-node-contract';

export type RegistryGateRule =
  | 'missing_fill_mode'
  | 'text_field_missing_role'
  | 'runtime_ai_required_without_essential';

export interface RegistryGateViolation {
  rule: RegistryGateRule;
  nodeType: string;
  fieldName: string;
  detail?: string;
}

/** Fields that may be runtime_ai + required but not essentialForExecution (operation-dependent). */
const RUNTIME_AI_REQUIRED_ESSENTIAL_ALLOWLIST: ReadonlySet<string> = new Set([
  // "nodeType.fieldName" — document in registry PR when adding.
]);

/**
 * Returns structural violations. Empty array = pass.
 */
export function runNodeRegistryGates(): RegistryGateViolation[] {
  const violations: RegistryGateViolation[] = [];
  const types = unifiedNodeRegistry.getAllTypes().sort();

  for (const nodeType of types) {
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) continue;

    const requiredSet = new Set(def.requiredInputs || []);

    for (const [fieldName, field] of Object.entries(def.inputSchema || {})) {
      violations.push(...checkField(nodeType, fieldName, field, requiredSet));
    }
  }

  return violations;
}

function checkField(
  nodeType: string,
  fieldName: string,
  field: NodeInputField,
  requiredInputs: Set<string>
): RegistryGateViolation[] {
  const out: RegistryGateViolation[] = [];
  const t = (field.type || '').toLowerCase();
  const isTextLike = t === 'string' || t === 'expression';

  if (!field.fillMode || !field.fillMode.default) {
    out.push({
      rule: 'missing_fill_mode',
      nodeType,
      fieldName,
      detail: 'fillMode.default is required',
    });
    return out;
  }

  const fm = field.fillMode.default;

  if (isTextLike && (!field.role || String(field.role).trim() === '')) {
    out.push({
      rule: 'text_field_missing_role',
      nodeType,
      fieldName,
      detail: 'string/expression fields must have semantic role',
    });
  }

  if (fm === 'runtime_ai') {
    const schemaRequired = !!field.required;
    const inRequiredInputs = requiredInputs.has(fieldName);
    const key = `${nodeType}.${fieldName}`;
    const allowlisted = RUNTIME_AI_REQUIRED_ESSENTIAL_ALLOWLIST.has(key);

    if ((schemaRequired || inRequiredInputs) && field.essentialForExecution !== true && !allowlisted) {
      out.push({
        rule: 'runtime_ai_required_without_essential',
        nodeType,
        fieldName,
        detail: 'essentialForExecution must be true for required runtime_ai fields',
      });
    }
  }

  return out;
}

export function formatGateViolations(violations: RegistryGateViolation[]): string {
  if (violations.length === 0) return 'OK: 0 registry gate violations';
  const lines = violations.map(
    (v) => `[${v.rule}] ${v.nodeType}.${v.fieldName}${v.detail ? ` — ${v.detail}` : ''}`
  );
  return lines.join('\n');
}
