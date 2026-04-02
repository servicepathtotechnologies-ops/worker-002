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
  isLikelyContaminatedFieldKey,
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
import { buildFormFieldTypeEvidence } from './form-field-type-evidence';
import { inferFormFieldTypeDecision } from './form-field-type-resolver';
import { normalizeFormFieldsIdentity } from '../../core/utils/form-field-identity';

function isFormLikeNodeType(nodeType: string): boolean {
  return nodeType === 'form' || nodeType === 'form_trigger';
}

function isLikelyPlannerNarrative(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  return (
    t.includes('detected nodes:') ||
    t.includes('branch slots:') ||
    t.includes('execution:') ||
    t.includes('terminal:') ||
    t.includes('terminals:') ||
    t.includes('configuration contract') ||
    t.includes('planner rules:')
  );
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
 * Rebuild form `fields` to match the canonical ordered key list (intent + graph-referenced operands).
 * Preserves labels, types, ids, and other properties from existing rows when the normalized key matches.
 */
export function reconcileFormFieldRecordsToAllowedKeys(
  existing: Array<Record<string, unknown>>,
  allowedOrderedKeys: string[]
): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of existing) {
    const k = normalizeFieldKey(String((row as any).key || (row as any).name || ''));
    if (k && !byKey.has(k)) byKey.set(k, row);
  }
  const templates = buildFormFieldRecordsFromKeys(allowedOrderedKeys) as Array<Record<string, unknown>>;
  const tmplByKey = new Map<string, Record<string, unknown>>();
  for (const t of templates) {
    const k = normalizeFieldKey(String((t as any).key || ''));
    if (k) tmplByKey.set(k, t);
  }
  const raw: Array<Record<string, unknown>> = [];
  for (const key of allowedOrderedKeys) {
    const nk = normalizeFieldKey(key);
    if (!nk) continue;
    const tmpl = tmplByKey.get(nk);
    if (!tmpl) continue;
    const prev = byKey.get(nk);
    if (prev) {
      raw.push({
        ...prev,
        key: nk,
        name: normalizeFieldKey(String((prev as any).name || nk)) || nk,
      });
    } else {
      raw.push({ ...tmpl });
    }
  }
  return normalizeFormFieldsIdentity(raw) as Array<Record<string, unknown>>;
}

/**
 * Applies structural alignment: persists workflowIntentModel, upgrades placeholder / incomplete form fields,
 * and re-derives if_else conditions against upstream form fields when safe (empty or input.* placeholders).
 */
export function applyStructuralIntentAlignment(workflow: Workflow): Workflow {
  const formIntentText = getFormStructuralIntentText(workflow);
  const workflowIntentText = getWorkflowIntentText(workflow);
  const intentText = formIntentText
    ? formIntentText
    : !isLikelyPlannerNarrative(workflowIntentText)
      ? workflowIntentText
      : '';

  const model: WorkflowIntentModel = buildWorkflowIntentModel(workflow, intentText);
  let w = mergeWorkflowIntentModelMetadata(workflow, model);
  const intentPruneDisabled = Boolean((w.metadata as any)?.disableFormFieldIntentPrune);

  const nodes = (w.nodes || []).map((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    if (!isFormLikeNodeType(nodeType)) return node;

    const config = { ...(node.data?.config || {}) } as Record<string, unknown>;
    const currentFields = Array.isArray(config.fields) ? (config.fields as Array<Record<string, unknown>>) : [];

    const keys = deriveOrderedFieldKeysForForm(intentText, w).filter((k) => !isLikelyContaminatedFieldKey(k));
    if (keys.length === 0) return node;

    let nextFields: Array<Record<string, unknown>> | null = null;
    const trustIntentPrune = !intentPruneDisabled && intentText.trim().length > 0;
    if (trustIntentPrune) {
      nextFields = reconcileFormFieldRecordsToAllowedKeys(currentFields, keys);
    } else if (isPlaceholderFormFields(config.fields) || currentFields.length === 0) {
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
  const withIfElseConditions = { ...w, nodes: nodes2 };
  const typeEvidence = buildFormFieldTypeEvidence(withIfElseConditions, intentText);
  const healedNodes = (withIfElseConditions.nodes || []).map((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    if (!isFormLikeNodeType(nodeType)) return node;
    const config = { ...(node.data?.config || {}) } as Record<string, unknown>;
    const fields = Array.isArray(config.fields) ? (config.fields as Array<Record<string, unknown>>) : [];
    if (fields.length === 0) return node;

    const nextFields = fields.map((field) => {
      const key = normalizeFieldKey(String((field as any).key || (field as any).name || (field as any).id || ''));
      if (!key) return field;
      const currentType = String((field as any).type || '').toLowerCase();
      const decision = inferFormFieldTypeDecision({
        key,
        currentType,
        intentText,
        workflow: withIfElseConditions,
        evidenceByField: typeEvidence,
        preserveExplicit: true,
      });
      if (!decision.type || decision.type === currentType) return field;
      return {
        ...field,
        type: decision.type,
      };
    });

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

  return { ...withIfElseConditions, nodes: healedNodes };
}
