/**
 * Projects workflowIntentModel + graph-derived keys onto form and if_else structural configs.
 * Call after initializeWorkflow / before final validateWorkflow. Does not mutate edges directly.
 */

import type { Workflow } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';
import {
  buildFormFieldRecordsFromKeys,
  deriveOrderedFieldKeysForForm,
  formFieldsMissingReferencedKeys,
  isPlaceholderFormFields,
  normalizeFieldKey,
} from './intent-extraction';
import {
  buildWorkflowIntentModel,
  mergeWorkflowIntentModelMetadata,
  type WorkflowIntentModel,
} from './workflow-intent-model';
import { getFormStructuralIntentText, getWorkflowIntentText, deriveIfElseConditionsFromIntent } from './structure-materializer';
import {
  conditionsReferenceInputPaths,
  findUpstreamFormContextForIfElse,
} from '../../core/orchestration/form-ifelse-binding';

function isFormLikeNodeType(nodeType: string): boolean {
  return nodeType === 'form' || nodeType === 'form_trigger';
}

function mergeFormFieldsPreservingLabels(
  existing: Array<Record<string, unknown>> | undefined,
  fromModel: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of existing || []) {
    const k = normalizeFieldKey(String((row as any).key || (row as any).name || ''));
    if (k) byKey.set(k, row);
  }
  for (const row of fromModel) {
    const k = normalizeFieldKey(String((row as any).key || ''));
    if (!k) continue;
    if (!byKey.has(k)) {
      byKey.set(k, row);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Applies structural alignment: persists workflowIntentModel, upgrades placeholder / incomplete form fields,
 * and re-derives if_else conditions against upstream form fields when safe (empty or input.* placeholders).
 */
export function applyStructuralIntentAlignment(workflow: Workflow): Workflow {
  const intentText = [getFormStructuralIntentText(workflow), getWorkflowIntentText(workflow)]
    .filter(Boolean)
    .join('\n');

  const model: WorkflowIntentModel = buildWorkflowIntentModel(workflow, intentText);
  let w = mergeWorkflowIntentModelMetadata(workflow, model);

  const nodes = (w.nodes || []).map((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    if (!isFormLikeNodeType(nodeType)) return node;

    const config = { ...(node.data?.config || {}) } as Record<string, unknown>;
    const currentFields = Array.isArray(config.fields) ? (config.fields as Array<Record<string, unknown>>) : [];

    const keys = deriveOrderedFieldKeysForForm(intentText, w);
    if (keys.length === 0) return node;

    let nextFields: Array<Record<string, unknown>> | null = null;
    if (isPlaceholderFormFields(config.fields) || currentFields.length === 0) {
      nextFields = buildFormFieldRecordsFromKeys(keys);
    } else if (formFieldsMissingReferencedKeys(w, currentFields)) {
      nextFields = mergeFormFieldsPreservingLabels(currentFields, buildFormFieldRecordsFromKeys(keys));
    }

    if (!nextFields) return node;

    return {
      ...node,
      data: {
        ...node.data,
        config: {
          ...config,
          fields: nextFields,
        },
      },
    };
  });

  w = { ...w, nodes };

  const nodes2 = (w.nodes || []).map((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    if (nodeType !== 'if_else') return node;

    const cond = node.data?.config?.conditions;
    const empty = cond === undefined || cond === null || (Array.isArray(cond) && cond.length === 0);
    if (!empty && !conditionsReferenceInputPaths(cond)) return node;

    const ctx = findUpstreamFormContextForIfElse(w, String(node.id));
    if (!ctx?.fields?.length) return node;

    const next = deriveIfElseConditionsFromIntent(intentText, ctx.fields);
    if (!next.length) return node;

    const config = { ...(node.data?.config || {}) };
    config.conditions = next;
    return {
      ...node,
      data: {
        ...node.data,
        config,
      },
    };
  });

  return { ...w, nodes: nodes2 };
}
