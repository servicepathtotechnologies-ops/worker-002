/**
 * Canonical "structural" prompt: Goal + numbered architecture + terminal.
 * Used when the raw user prompt lacks an explicit execution layout.
 */

import { pruneProposedPlanChain } from './plan-chain-prune';
import { buildRegistryStructuralFillContractSection } from './registry-structural-fill-contract';

export interface FormatArchitecturalPromptParams {
  /** Ground truth user objective */
  goal: string;
  /** Ordered node types (trigger → … → terminal) */
  proposedNodeChain: string[];
  /** Optional summarize / variation text to fold into Goal when present */
  narrativeContext?: string;
  /** When true, append registry-derived fill-mode contract for every distinct node type in the chain */
  includeRegistryFillContract?: boolean;
}

export function formatArchitecturalWorkflowPrompt(params: FormatArchitecturalPromptParams): string {
  const chain = pruneProposedPlanChain(params.proposedNodeChain);
  const goalLine =
    (params.narrativeContext && String(params.narrativeContext).trim()) ||
    String(params.goal || '').trim() ||
    'Automate the described task end-to-end.';
  const executionLines = chain.map((t, i) => `${i + 1}. ${t} (${t})`);
  const logCount = chain.filter((t) => t === 'log_output').length;
  const terminalLine =
    logCount > 1
      ? `Terminals: ${logCount} × log_output (one per branch path; do not merge).`
      : `Terminal: ${chain.length > 0 ? chain[chain.length - 1] : 'log_output'}.`;
  const parts = [
    'Goal:',
    goalLine,
    '',
    'Architecture (execution order):',
    ...executionLines,
    '',
    terminalLine,
    ...(logCount > 1
      ? ['Rule: keep branch terminals separate — never merge multiple branch outputs into one log_output.']
      : []),
  ];
  if (params.includeRegistryFillContract) {
    parts.push('', buildRegistryStructuralFillContractSection(chain));
  }
  return parts.join('\n');
}

/** True when the prompt already encodes a structured layout (do not replace). */
export function structuredPromptAlreadyHasArchitecture(text: string): boolean {
  const s = String(text || '');
  return /\b(execution|architecture|terminal)\s*:/i.test(s) || /\d+\.\s+\w+\s*\(/i.test(s);
}
