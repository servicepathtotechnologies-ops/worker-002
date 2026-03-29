/**
 * Single source of truth for "is this config value empty?" and
 * "should this field be treated as required before execution?" across:
 * - validateStructuralReadiness
 * - discoverNodeInputs
 * - comprehensive-node-questions-generator
 */

import type { NodeInputField } from '../types/unified-node-contract';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { nodeLibrary } from '../../services/nodes/node-library';
import { resolveEffectiveFieldFillMode } from '../utils/fill-mode-resolver';
import {
  isCredentialOwnership,
  isStructuralOwnership,
} from '../utils/field-ownership';

export function isEmptyConfigValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0)
  );
}

function getNodeLibraryRequiredSet(nodeType: string): Set<string> {
  const schema = nodeLibrary.getSchema(nodeType);
  const req = schema?.configSchema?.required;
  return new Set(Array.isArray(req) ? req : []);
}

/**
 * True if the unified registry marks the field as required for the node type
 * (requiredInputs list or per-field required flag).
 */
export function isFieldInRegistryRequiredList(
  nodeType: string,
  fieldName: string
): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  if (def.requiredInputs?.includes(fieldName)) return true;
  const fd = def.inputSchema?.[fieldName] as NodeInputField | undefined;
  return !!fd?.required;
}

/**
 * Whether a field should be labeled required in wizard / discoverNodeInputs
 * when it is still empty (value-layer and structural layer; excludes credentials).
 */
export function computeFieldRequiredBeforeExecution(
  nodeType: string,
  fieldName: string,
  fieldDef: NodeInputField | undefined,
  config: Record<string, unknown>
): boolean {
  if (!fieldDef) {
    return (
      isFieldInRegistryRequiredList(nodeType, fieldName) ||
      getNodeLibraryRequiredSet(nodeType).has(fieldName)
    );
  }

  if (isCredentialOwnership(fieldName, fieldDef)) {
    return false;
  }

  const def = unifiedNodeRegistry.get(nodeType);
  const inputSchema = (def?.inputSchema || {}) as Record<string, NodeInputField>;
  const mode = resolveEffectiveFieldFillMode(
    fieldName,
    inputSchema,
    config as Record<string, any>
  );
  if (mode === 'runtime_ai' && fieldDef.fillMode?.supportsRuntimeAI !== false) {
    return false;
  }

  const libRequired = getNodeLibraryRequiredSet(nodeType).has(fieldName);
  const inRequiredInputs = def?.requiredInputs?.includes(fieldName) ?? false;
  const fieldMarkedRequired = !!fieldDef.required;

  if (isStructuralOwnership(fieldName, fieldDef)) {
    return inRequiredInputs || fieldMarkedRequired || libRequired;
  }

  return inRequiredInputs || fieldMarkedRequired || libRequired;
}
