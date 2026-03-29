/**
 * PATCH /api/workflows/:id/nodes/:nodeId/field-mode
 *
 * Updates the fill mode toggle for a specific field on a workflow node.
 * Persists the change to _fieldModes in node.data.config and re-evaluates
 * the credential gate when the new mode is manual_static for a credential field.
 *
 * Spec: Task 8 — Requirements 9.1, 9.3, 9.4, 9.5, 9.6, 9.7
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { unifiedNormalizeNodeType } from '../core/utils/unified-node-type-normalizer';
import { shouldRequireCredential } from '../services/workflow-lifecycle-manager';
import type { FieldFillMode } from '../core/types/unified-node-contract';

const VALID_MODES: FieldFillMode[] = ['manual_static', 'buildtime_ai_once', 'runtime_ai'];

export async function patchWorkflowFieldMode(req: Request, res: Response): Promise<void> {
  const { id: workflowId, nodeId } = req.params;
  const { fieldName, mode } = req.body as { fieldName?: string; mode?: string };

  // Validate inputs
  if (!fieldName || typeof fieldName !== 'string') {
    res.status(400).json({ error: 'fieldName is required' });
    return;
  }
  if (!mode || !VALID_MODES.includes(mode as FieldFillMode)) {
    res.status(400).json({ error: `mode must be one of: ${VALID_MODES.join(', ')}` });
    return;
  }

  const supabase = getSupabaseClient();

  // Load workflow from database
  const { data: workflowRow, error: loadError } = await supabase
    .from('workflows')
    .select('workflow_data')
    .eq('id', workflowId)
    .single();

  if (loadError || !workflowRow) {
    res.status(404).json({ error: `Workflow ${workflowId} not found` });
    return;
  }

  const workflowData = workflowRow.workflow_data as { nodes?: any[]; edges?: any[] };
  const nodes: any[] = workflowData?.nodes ?? [];

  // Find the target node
  const nodeIndex = nodes.findIndex((n: any) => n.id === nodeId);
  if (nodeIndex === -1) {
    res.status(404).json({ error: `Node ${nodeId} not found in workflow ${workflowId}` });
    return;
  }

  const node = nodes[nodeIndex];
  const nodeType = unifiedNormalizeNodeType(node);
  const config = node.data?.config ?? {};

  // Update _fieldModes
  const updatedFieldModes: Record<string, FieldFillMode> = {
    ...(config._fieldModes ?? {}),
    [fieldName]: mode as FieldFillMode,
  };

  const updatedConfig = {
    ...config,
    _fieldModes: updatedFieldModes,
  };

  // Re-evaluate credential gate if the new mode is manual_static and field is a credential
  let requiresCredential = false;
  if (mode === 'manual_static') {
    requiresCredential = shouldRequireCredential(nodeType, fieldName, updatedFieldModes);
  }

  // Persist updated node config
  const updatedNodes = [...nodes];
  updatedNodes[nodeIndex] = {
    ...node,
    data: { ...node.data, config: updatedConfig },
  };

  const { error: saveError } = await supabase
    .from('workflows')
    .update({ workflow_data: { ...workflowData, nodes: updatedNodes } })
    .eq('id', workflowId);

  if (saveError) {
    res.status(500).json({ error: `Failed to save workflow: ${saveError.message}` });
    return;
  }

  res.json({
    nodeId,
    fieldName,
    mode,
    updatedConfig,
    requiresCredential,
  });
}
