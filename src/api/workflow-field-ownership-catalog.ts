import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { buildWorkflowFieldCatalog } from '../services/ai/workflow-field-catalog';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';

const CREDENTIAL_FIELD_PATTERN = /(credential|token|secret|password|client[_-]?id|client[_-]?secret|api[_-]?key|oauth)/i;

function isCredentialField(nodeType: string, fieldName: string): boolean {
  if (CREDENTIAL_FIELD_PATTERN.test(fieldName)) {
    return true;
  }
  const definition = unifiedNodeRegistry.get(nodeType);
  if (!definition?.credentialSchema?.requirements?.length) {
    return false;
  }
  const normalized = fieldName.toLowerCase();
  return definition.credentialSchema.requirements.some((req: any) => {
    const key = String(req?.vaultKey || '').toLowerCase();
    return !!key && normalized.includes(key);
  });
}

export default async function workflowFieldOwnershipCatalogHandler(req: Request, res: Response) {
  try {
    const { workflowId } = req.params;
    if (!workflowId) {
      return res.status(400).json({ error: 'workflowId is required' });
    }

    const supabase = getSupabaseClient();
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('id, nodes, edges')
      .eq('id', workflowId)
      .single();

    if (error || !workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const nodes = Array.isArray(workflow.nodes)
      ? workflow.nodes
      : (typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : []);
    const edges = Array.isArray(workflow.edges)
      ? workflow.edges
      : (typeof workflow.edges === 'string' ? JSON.parse(workflow.edges) : []);

    const allFields = buildWorkflowFieldCatalog({ nodes, edges } as any);
    const ownershipFields = allFields.filter((entry) => !isCredentialField(entry.nodeType, entry.fieldName));

    return res.json({
      success: true,
      workflowId,
      ownershipFields,
      totalFields: ownershipFields.length,
    });
  } catch (e: any) {
    return res.status(500).json({
      error: 'Failed to build ownership catalog',
      message: e?.message || 'Unknown error',
    });
  }
}
