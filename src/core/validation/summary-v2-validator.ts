import type { WorkflowSummaryV2 } from '../types/ai-types';

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateSummaryV2(summary: unknown): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!summary || typeof summary !== 'object') {
    return { valid: false, errors: ['summaryV2 must be an object'] };
  }

  const s = summary as WorkflowSummaryV2;
  if (!s.graphOverview) errors.push('summaryV2.graphOverview is required');
  if (!Array.isArray(s.executionBackbone) || s.executionBackbone.length === 0) {
    errors.push('summaryV2.executionBackbone must be a non-empty array');
  }
  if (!Array.isArray(s.branches)) errors.push('summaryV2.branches must be an array');
  if (!Array.isArray(s.nodes) || s.nodes.length === 0) {
    errors.push('summaryV2.nodes must be a non-empty array');
  }
  if (!Array.isArray(s.pathOutcomes) || s.pathOutcomes.length === 0) {
    errors.push('summaryV2.pathOutcomes must be a non-empty array');
  }
  if (!Array.isArray(s.validationFindings)) errors.push('summaryV2.validationFindings must be an array');

  if (s.graphOverview) {
    if (!Array.isArray(s.graphOverview.triggerNodeIds)) errors.push('summaryV2.graphOverview.triggerNodeIds must be an array');
    if (!Array.isArray(s.graphOverview.terminalNodeIds)) errors.push('summaryV2.graphOverview.terminalNodeIds must be an array');
    if (s.graphOverview.hasBranching && (!Array.isArray(s.branches) || s.branches.length === 0)) {
      errors.push('summaryV2.branches must enumerate branch paths when graphOverview.hasBranching=true');
    }
  }

  for (const [index, node] of (s.nodes || []).entries()) {
    if (!nonEmptyString(node.nodeId)) errors.push(`summaryV2.nodes[${index}].nodeId is required`);
    if (!nonEmptyString(node.nodeType)) errors.push(`summaryV2.nodes[${index}].nodeType is required`);
    if (!nonEmptyString(node.purpose)) errors.push(`summaryV2.nodes[${index}].purpose is required`);
  }

  for (const [index, path] of (s.pathOutcomes || []).entries()) {
    if (!nonEmptyString(path.pathId)) errors.push(`summaryV2.pathOutcomes[${index}].pathId is required`);
    if (!Array.isArray(path.nodePath) || path.nodePath.length === 0) {
      errors.push(`summaryV2.pathOutcomes[${index}].nodePath must be non-empty`);
    }
    if (!nonEmptyString(path.terminalNodeId)) {
      errors.push(`summaryV2.pathOutcomes[${index}].terminalNodeId is required`);
    }
  }

  for (const [index, branch] of (s.branches || []).entries()) {
    if (!Array.isArray(branch.cases) || branch.cases.length === 0) {
      errors.push(`summaryV2.branches[${index}].cases must be non-empty`);
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

