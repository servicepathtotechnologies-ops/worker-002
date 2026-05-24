import { Workflow } from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';

export interface WorkflowFieldCatalogEntry {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
  essentialForExecution: boolean;
  role?: string;
  ownership?: string;
  fillModeDefault?: string;
  supportsRuntimeAI?: boolean;
  supportsBuildtimeAI?: boolean;
  fieldIntelligence?: unknown;
  currentValue?: unknown;
}

/**
 * Build a registry-driven field catalog for full-configuration UX.
 * Includes all essential input fields for every node in the workflow.
 */
export function buildWorkflowFieldCatalog(workflow: Workflow): WorkflowFieldCatalogEntry[] {
  const entries: WorkflowFieldCatalogEntry[] = [];

  for (const node of workflow.nodes || []) {
    const nodeType = unifiedNormalizeNodeType(node);
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def?.inputSchema) continue;

    const currentConfig = (node as any)?.data?.config || {};
    const nodeLabel = (node as any)?.data?.label || nodeType;

    for (const [fieldName, fieldDef] of Object.entries(def.inputSchema)) {
      const required = !!fieldDef.required;
      const essential = required || !!fieldDef.essentialForExecution;
      if (!essential) continue;

      entries.push({
        nodeId: (node as any).id,
        nodeType,
        nodeLabel,
        fieldName,
        fieldType: fieldDef.type,
        required,
        essentialForExecution: essential,
        role: fieldDef.role,
        ownership: fieldDef.ownership,
        fillModeDefault: fieldDef.fillMode?.default,
        supportsRuntimeAI: !!fieldDef.fillMode?.supportsRuntimeAI,
        supportsBuildtimeAI: !!fieldDef.fillMode?.supportsBuildtimeAI,
        fieldIntelligence: fieldDef.fieldIntelligence,
        currentValue: currentConfig[fieldName],
      });
    }
  }

  return entries;
}
