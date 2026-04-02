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
  const edges = Array.isArray((workflow as any)?.edges) ? (workflow as any).edges : [];
  const nodeById = new Map(nodes.map((n: any) => [n.id, n]));
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
          : 'form fields are not configured yet';
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
        .map((c: any) =>
          String(
            c?.expression ||
              `${c?.field || 'value'} ${c?.operator || ''} ${c?.value || ''}`
          ).trim()
        )
        .filter(Boolean)[0];
      const hasConditions = conditions.length > 0;
      const readable = hasConditions && condText ? condText : 'missing conditions';
      nodeNarratives.push({
        nodeId: node.id,
        nodeType,
        text: hasConditions
          ? `${label} evaluates ${readable} and routes to true/false branches.`
          : `${label} has no conditions configured yet; true/false branches will not behave as intended.`,
      });
      if (hasConditions) {
        branchNarratives.push(
          'If condition is true, workflow follows the success branch.'
        );
        branchNarratives.push(
          'If condition is false, workflow follows the fallback branch.'
        );
        const trueEdge = edges.find((e: any) =>
          e.source === node.id &&
          (String(e.type || e.sourceHandle || '').toLowerCase() === 'true')
        );
        const falseEdge = edges.find((e: any) =>
          e.source === node.id &&
          (String(e.type || e.sourceHandle || '').toLowerCase() === 'false')
        );
        const describeTarget = (targetId?: string) => {
          if (!targetId) return 'an unassigned node';
          const target = nodeById.get(targetId);
          return target
            ? String(target.data?.label || unifiedNormalizeNodeType(target))
            : `node ${targetId}`;
        };
        branchNarratives.push(`True branch routes to ${describeTarget(trueEdge?.target)}.`);
        branchNarratives.push(`False branch routes to ${describeTarget(falseEdge?.target)}.`);
      } else {
        branchNarratives.push(
          `${label} has missing conditions; configure them before relying on true/false branches.`
        );
      }
      continue;
    }

    if (nodeType === 'switch') {
      const cases = isNonEmptyArray(cfg.cases)
        ? cfg.cases
            .map((c: any) => String(c?.value || c?.label || '').trim())
            .filter(Boolean)
        : [];
      const hasCases = cases.length > 0;
      const expressionField = String(cfg.expression || '{{$json.value}}');
      // Extract just the field name from {{$json.fieldName}} for readability
      const fieldMatch = expressionField.match(/\{\{\$json\.(\w+)\}\}/);
      const fieldName = fieldMatch ? fieldMatch[1] : expressionField;
      nodeNarratives.push({
        nodeId: node.id,
        nodeType,
        text: hasCases
          ? `${label} checks "${fieldName}" and routes to: ${humanJoin(cases)}.`
          : `${label} checks "${fieldName}" but no cases are configured yet.`,
      });
      if (hasCases) {
        const caseEdges = edges
          .filter((e: any) => e.source === node.id)
          .filter((e: any) => String(e.type || e.sourceHandle || '').toLowerCase().startsWith('case_'))
          .sort((a: any, b: any) => {
            const ai = Number(String(a.type || a.sourceHandle || '').split('_')[1] || 0);
            const bi = Number(String(b.type || b.sourceHandle || '').split('_')[1] || 0);
            return ai - bi;
          });
        for (let i = 0; i < caseEdges.length; i++) {
          const edge = caseEdges[i];
          const target = nodeById.get(edge.target);
          const targetLabel = target
            ? String(target.data?.label || unifiedNormalizeNodeType(target))
            : `node ${edge.target}`;
          const caseLabel = cases[i] || String(edge.type || edge.sourceHandle || `case_${i + 1}`);
          branchNarratives.push(`Case "${caseLabel}" routes to ${targetLabel}.`);
        }
      }
      continue;
    }

    if (nodeType === 'log_output') {
      terminalObservability.push(
        `${label} records final branch output with level "${String(cfg.level || 'info')}".`
      );
      nodeNarratives.push({
        nodeId: node.id,
        nodeType,
        text: `${label} records the result for this branch.`,
      });
      continue;
    }

    // Generic node — show a clean human-readable description
    const friendlyType = nodeType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    nodeNarratives.push({
      nodeId: node.id,
      nodeType,
      text: `${label} runs the ${friendlyType} action.`,
    });
  }

  const overviewText =
    nodeNarratives.length > 0
      ? nodeNarratives.map((n) => n.text).join(' ')
      : 'Workflow structure is being prepared.';

  return {
    overviewText,
    nodeNarratives,
    branchNarratives,
    terminalObservability,
  };
}
