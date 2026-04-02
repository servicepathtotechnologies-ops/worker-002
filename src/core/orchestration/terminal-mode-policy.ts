import type { Workflow, WorkflowNode } from '../types/ai-types';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeType } from '../utils/unified-node-type-normalizer';

export type TerminalMode = 'log_output_preferred' | 'gmail_terminal' | 'mixed';

export interface TerminalModeEvaluation {
  mode: TerminalMode;
  hasLeafLogOutput: boolean;
  hasLeafGmail: boolean;
  hasGmailBeforeTerminal: boolean;
  hasLeafSinkOutput: boolean;
  errors: string[];
  warnings: string[];
}

export function resolveTerminalMode(workflow: Workflow): TerminalMode {
  const raw = String(((workflow as any)?.metadata?.terminalMode || 'log_output_preferred')).toLowerCase();
  if (raw === 'gmail_terminal') return 'gmail_terminal';
  if (raw === 'mixed') return 'mixed';
  return 'log_output_preferred';
}

function getLeafNodes(workflow: Workflow): WorkflowNode[] {
  const hasOutgoing = new Set((workflow.edges || []).map((e) => e.source));
  return (workflow.nodes || []).filter((n) => !hasOutgoing.has(n.id));
}

export function evaluateTerminalMode(workflow: Workflow): TerminalModeEvaluation {
  const mode = resolveTerminalMode(workflow);
  const leafNodes = getLeafNodes(workflow);
  const leafTypes = leafNodes.map((n) => unifiedNormalizeNodeType(n));
  const hasLeafLogOutput = leafTypes.includes('log_output');
  const hasLeafGmail = leafTypes.includes('google_gmail');
  const hasLeafSinkOutput = leafNodes.some((n) => {
    const def = unifiedNodeRegistry.get(unifiedNormalizeNodeType(n));
    return (def?.tags || []).includes('output') || (def?.tags || []).includes('sink');
  });
  const nodeById = new Map((workflow.nodes || []).map((n) => [n.id, n]));
  const hasGmailBeforeTerminal = (workflow.edges || []).some((e) => {
    const sourceType = unifiedNormalizeNodeType(nodeById.get(e.source) as any);
    const targetType = unifiedNormalizeNodeType(nodeById.get(e.target) as any);
    return sourceType === 'google_gmail' && targetType === 'log_output';
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  if (mode === 'gmail_terminal' && !hasLeafGmail && !hasGmailBeforeTerminal) {
    errors.push('Terminal mode "gmail_terminal" requires a terminal gmail route (leaf gmail or gmail -> log_output)');
  } else if (mode === 'mixed') {
    if (!hasLeafLogOutput && !hasLeafSinkOutput) {
      errors.push('Terminal mode "mixed" requires at least one terminal output leaf node');
    }
  } else if (!hasLeafLogOutput && hasLeafSinkOutput) {
    warnings.push('No log_output terminal found; using output sink terminal mode');
  }

  return {
    mode,
    hasLeafLogOutput,
    hasLeafGmail,
    hasGmailBeforeTerminal,
    hasLeafSinkOutput,
    errors,
    warnings,
  };
}

