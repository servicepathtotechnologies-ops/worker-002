import type { Workflow } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';

export type StructuralBlueprint = {
  overviewText: string;
  nodeNarratives: Array<{ nodeId: string; nodeType: string; text: string }>;
  branchNarratives: string[];
  terminalObservability: string[];
};

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function humanJoin(values: string[]): string {
  if (values.length <= 1) return values[0] || '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

export function buildStructuralBlueprint(workflow: Workflow): StructuralBlueprint {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const nodeNarratives: Array<{ nodeId: string; nodeType: string; text: string }> = [];
  const branchNarratives: string[] = [];
  const terminalObservability: string[] = [];

  for (const node of nodes as any[]) {
    const nodeType = unifiedNormalizeNodeType(node);
    const cfg = (node?.data?.config || {}) as Record<string, any>;
    const label = String(node?.data?.label || nodeType);

    if (nodeType === 'form') {
      const fields = isNonEmptyArray(cfg.fields)
        ? cfg.fields
            .map((f: any) => String(f?.label || f?.name || f?.key || '').trim())
            .filter(Boolean)
        : [];
      const fieldSentence =
        fields.length > 0
          ? `users will enter ${humanJoin(fields)}`
          : 'users will enter the required form fields';
      nodeNarratives.push({
        nodeId: node.id,
        nodeType,
        text: `${label} captures input data; ${fieldSentence}.`,
      });
      continue;
    }

    if (nodeType === 'if_else') {
      const conditions = isNonEmptyArray(cfg.conditions) ? cfg.conditions : [];
      const condText = conditions
        .map((c: any) => String(c?.expression || `${c?.field || 'value'} ${c?.operator || ''} ${c?.value || ''}`).trim())
        .filter(Boolean)[0];
      const readable = condText || 'configured condition';
      nodeNarratives.push({
        nodeId: node.id,
        nodeType,
        text: `${label} evaluates ${readable} and routes to true/false branches.`,
      });
      branchNarratives.push(`If condition is true, workflow follows the success branch.`);
      branchNarratives.push(`If condition is false, workflow follows the fallback branch.`);
      continue;
    }

    if (nodeType === 'switch') {
      const cases = isNonEmptyArray(cfg.cases)
        ? cfg.cases.map((c: any) => String(c?.label || c?.value || '').trim()).filter(Boolean)
        : [];
      nodeNarratives.push({
        nodeId: node.id,
        nodeType,
        text: `${label} evaluates ${String(cfg.expression || 'switch expression')} and routes to ${cases.length > 0 ? humanJoin(cases) : 'configured cases'}.`,
      });
      continue;
    }

    if (nodeType === 'log_output') {
      terminalObservability.push(
        `${label} records final branch output with level "${String(cfg.level || 'info')}".`
      );
      nodeNarratives.push({
        nodeId: node.id,
        nodeType,
        text: `${label} provides terminal observability for this workflow path.`,
      });
      continue;
    }

    nodeNarratives.push({
      nodeId: node.id,
      nodeType,
      text: `${label} executes ${nodeType.replace(/_/g, ' ')} operation.`,
    });
  }

  const overviewText =
    nodeNarratives.length > 0
      ? `Workflow structure: ${nodeNarratives.map((n) => n.text).join(' ')}`
      : 'Workflow structure is being prepared.';

  return {
    overviewText,
    nodeNarratives,
    branchNarratives,
    terminalObservability,
  };
}
