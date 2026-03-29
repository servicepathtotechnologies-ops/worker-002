/**
 * Versioned first-generation intent artifact: collected inputs and optional branch hints.
 * Drives structural alignment with form / if_else configs — no per-workflow hardcoding.
 */

import type { Workflow } from '../../core/types/ai-types';
import {
  deriveOrderedFieldKeysForForm,
  inferFieldTypeFromKey,
  toTitleLabel,
} from './intent-extraction';

export const WORKFLOW_INTENT_MODEL_VERSION = 1 as const;

export interface WorkflowIntentCollectedInput {
  key: string;
  labelHint: string;
  /** Registry-friendly type hint (text, email, number, …) */
  typeHint: string;
}

export interface WorkflowIntentModel {
  version: typeof WORKFLOW_INTENT_MODEL_VERSION;
  /** When the model was computed (ISO8601) */
  builtAt: string;
  collectedInputs: WorkflowIntentCollectedInput[];
}

export function buildWorkflowIntentModel(workflow: Workflow, intentText: string): WorkflowIntentModel {
  const keys = deriveOrderedFieldKeysForForm(intentText, workflow);
  const collectedInputs: WorkflowIntentCollectedInput[] = keys.map((key) => ({
    key,
    labelHint: toTitleLabel(key),
    typeHint: inferFieldTypeFromKey(key),
  }));

  return {
    version: WORKFLOW_INTENT_MODEL_VERSION,
    builtAt: new Date().toISOString(),
    collectedInputs,
  };
}

/** One-line summary for structured plan / UI (registry keys only, no node hardcoding). */
export function formatWorkflowIntentModelDigest(model: WorkflowIntentModel): string {
  if (!model.collectedInputs?.length) return '';
  const parts = model.collectedInputs.map((i) => `${i.key} (${i.labelHint})`);
  return `Collected inputs aligned to form/conditions: ${parts.join(', ')}.`;
}

export function mergeWorkflowIntentModelMetadata(
  workflow: Workflow | undefined,
  model: WorkflowIntentModel
): Workflow {
  if (!workflow) {
    return { nodes: [], edges: [], metadata: { workflowIntentModel: model } } as Workflow;
  }
  return {
    ...workflow,
    metadata: {
      ...((workflow as any).metadata || {}),
      workflowIntentModel: model,
    },
  } as Workflow;
}
