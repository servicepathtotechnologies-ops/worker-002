/**
 * Aligns if_else condition field paths with upstream form field internal names.
 * Generated workflows often use placeholder `input.*` while form output exposes
 * `$json.<internalName>` (see typed-value-resolver / execute-workflow if_else).
 */

import type { Workflow } from '../types/ai-types';
import {
  findUpstreamFormContextForIfElse,
  getNormalizedNodeType,
  normalizeIntentFieldToken,
  pickFormFieldKeyForAgeIntent,
  resolveFormFieldKeyForConditionOperand,
} from './form-ifelse-binding';

export { pickFormFieldKeyForAgeIntent } from './form-ifelse-binding';

function replaceInputPathsInString(s: string, fields: Array<Record<string, unknown>>): string {
  return s.replace(/\binput\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (full, name: string) => {
    const normalized = normalizeIntentFieldToken(name);
    const key = resolveFormFieldKeyForConditionOperand(normalized, fields);
    if (!key) return full;
    return `$json.${key}`;
  });
}

function deepRemapConditions(value: unknown, fields: Array<Record<string, unknown>>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return replaceInputPathsInString(value, fields);
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepRemapConditions(v, fields));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepRemapConditions(v, fields);
    }
    return out;
  }
  return value;
}

/**
 * Mutates a copy of workflow nodes' if_else configs when a form upstream exists
 * and conditions reference `input.<name>` placeholders.
 */
export function repairIfElseConditionsFromUpstreamForm(workflow: Workflow): Workflow {
  const nodes = workflow.nodes || [];

  const updatedNodes = nodes.map((node: any) => {
    const nt = getNormalizedNodeType(node);
    if (nt !== 'if_else') return node;

    const ctx = findUpstreamFormContextForIfElse(workflow, String(node.id));
    if (!ctx?.fields?.length) return node;

    const fields = ctx.fields;
    const cond = node.data?.config?.conditions;
    if (cond === undefined || cond === null) return node;

    const serialized = JSON.stringify(cond);
    if (!serialized.includes('input.')) return node;

    const nextConditions = deepRemapConditions(cond, fields);
    return {
      ...node,
      data: {
        ...node.data,
        config: {
          ...node.data.config,
          conditions: nextConditions,
        },
      },
    };
  });

  return { ...workflow, nodes: updatedNodes };
}
