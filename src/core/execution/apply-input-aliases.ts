/**
 * Registry-driven alias fields: copy canonical → alias before strict runtime_ai validation.
 * See NodeInputField.aliasOf in unified-node-contract.ts.
 */

import type { NodeInputField } from '../types/unified-node-contract';
import { isMeaningfulStaticValue } from '../utils/fill-mode-resolver';

export function applyInputAliasesFromSchema(
  resolvedInputs: Record<string, unknown>,
  inputSchema: Record<string, NodeInputField | unknown>
): string[] {
  const filled: string[] = [];
  // Canonical → alias (e.g. Slack: copy filled `message` into empty `text`)
  for (const [fieldName, def] of Object.entries(inputSchema)) {
    const aliasOf = (def as NodeInputField)?.aliasOf;
    if (!aliasOf || typeof aliasOf !== 'string') continue;
    if (isMeaningfulStaticValue(resolvedInputs[fieldName])) continue;
    const canonical = resolvedInputs[aliasOf];
    if (!isMeaningfulStaticValue(canonical)) continue;
    resolvedInputs[fieldName] = canonical;
    filled.push(fieldName);
  }
  // Alias → canonical when canonical is empty (e.g. runtime AI mapped plain text to `text` first; `message` is essential)
  for (const [fieldName, def] of Object.entries(inputSchema)) {
    const aliasOf = (def as NodeInputField)?.aliasOf;
    if (!aliasOf || typeof aliasOf !== 'string') continue;
    if (!isMeaningfulStaticValue(resolvedInputs[fieldName])) continue;
    if (isMeaningfulStaticValue(resolvedInputs[aliasOf])) continue;
    resolvedInputs[aliasOf] = resolvedInputs[fieldName];
    filled.push(aliasOf);
  }
  return filled;
}
