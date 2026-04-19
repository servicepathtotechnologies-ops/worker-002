/**
 * Canonical "structural" prompt: Goal + numbered architecture + terminal.
 * Used when the raw user prompt lacks an explicit execution layout.
 * 
 * ENHANCED: Now uses AI-driven summary generation instead of hardcoded templates.
 * The AI understands user intent, selected nodes, and use cases to generate
 * contextual, accurate workflow summaries.
 */

import { pruneProposedPlanChain } from './plan-chain-prune';
import { buildRegistryStructuralFillContractSection } from './registry-structural-fill-contract';
import { aiDrivenWorkflowSummaryGenerator, AIWorkflowSummaryInput } from './ai-driven-workflow-summary-generator';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface FormatArchitecturalPromptParams {
  /** Ground truth user objective */
  goal: string;
  /** Ordered node types (trigger → … → terminal) */
  proposedNodeChain: string[];
  /** Optional summarize / variation text to fold into Goal when present */
  narrativeContext?: string;
  /** When true, append registry-derived fill-mode contract for every distinct node type in the chain */
  includeRegistryFillContract?: boolean;
  /** When true, use AI-driven summary generation instead of hardcoded templates */
  useAIDrivenSummary?: boolean;
  /** Optional: Use cases for AI context */
  useCases?: string[];
  /** Optional: Requirements for AI context */
  requirements?: string[];
  /** Optional: Branching logic description */
  branchingLogic?: string;
}

/**
 * Async version: Uses AI-driven summary generation
 */
export async function formatArchitecturalWorkflowPromptAsync(params: FormatArchitecturalPromptParams): Promise<string> {
  const chain = pruneProposedPlanChain(params.proposedNodeChain);
  const goalLine =
    (params.narrativeContext && String(params.narrativeContext).trim()) ||
    String(params.goal || '').trim() ||
    'Automate the described task end-to-end.';
  
  // Use AI-driven summary if requested
  if (params.useAIDrivenSummary) {
    try {
      const aiInput: AIWorkflowSummaryInput = {
        userPrompt: goalLine,
        nodeChain: chain,
        useCases: params.useCases,
        requirements: params.requirements,
        branchingLogic: params.branchingLogic,
      };
      
      const aiResult = await aiDrivenWorkflowSummaryGenerator.generateSummary(aiInput);
      
      if (params.includeRegistryFillContract) {
        return aiResult.summary + '\n\n' + buildRegistryStructuralFillContractSection(chain);
      }
      
      return aiResult.summary;
    } catch (error) {
      console.error('[StructuredWorkflowPrompt] AI-driven summary generation failed, falling back to template:', error);
      // Fall back to template-based summary
    }
  }
  
  // Fall back to synchronous version
  return formatArchitecturalWorkflowPrompt(params);
}

/**
 * Synchronous version (for backward compatibility)
 * Falls back to template-based summary
 */
export function formatArchitecturalWorkflowPrompt(params: FormatArchitecturalPromptParams): string {
  const chain = pruneProposedPlanChain(params.proposedNodeChain);
  const goalLine =
    (params.narrativeContext && String(params.narrativeContext).trim()) ||
    String(params.goal || '').trim() ||
    'Automate the described task end-to-end.';
  
  // Original minimal format (backward compatible)
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


/**
 * Format AI-generated summary for frontend display
 * Converts comprehensive summary to frontend-expected format:
 * WORKFLOW: [objective]
 * TRIGGER: [trigger description]
 * FLOW: [flow description]
 * CONNECTIONS: [connections description]
 */
export function formatSummaryForFrontend(aiSummary: string): string {
  // Extract sections from AI-generated summary with improved regex patterns
  
  // Extract OBJECTIVE (after 📋 OBJECTIVE: until next section)
  const objectiveMatch = aiSummary.match(/📋 OBJECTIVE:\s*([\s\S]*?)(?=\n\n�|$)/);
  const objective = objectiveMatch?.[1]?.trim() || 'Automate workflow';
  
  // Extract EXECUTION STEPS section (the comprehensive node-by-node breakdown)
  const executionStepsMatch = aiSummary.match(/🔄 EXECUTION STEPS[\s\S]*?(?=⚡ BRANCHING|🎯 TERMINAL|📤 COMPLETE|✅ VALIDATION|═══|$)/);
  let executionStepsText = '';
  
  if (executionStepsMatch) {
    // Parse execution steps into a readable flow format
    const stepsContent = executionStepsMatch[0];
    const stepMatches = stepsContent.matchAll(/STEP (\d+):\s*(\w+[\w_]*)\s*\n([\s\S]*?)(?=STEP \d+:|⚡|🎯|📤|✅|═══|$)/g);
    
    const flowLines: string[] = [];
    for (const match of stepMatches) {
      const stepNum = match[1];
      const nodeType = match[2];
      const stepContent = match[3];
      
      // Extract purpose from step content
      const purposeMatch = stepContent.match(/Purpose:\s*(.+?)(?=\n|$)/);
      const purpose = purposeMatch?.[1]?.trim() || nodeType;
      
      flowLines.push(`${stepNum}. ${nodeType} - ${purpose}`);
    }
    
    executionStepsText = flowLines.length > 0 
      ? flowLines.join('\n')
      : 'Nodes will execute in sequence as configured';
  }
  
  // Extract BRANCHING LOGIC if present
  const branchingMatch = aiSummary.match(/⚡ BRANCHING LOGIC[\s\S]*?(?=🎯|📤|✅|═══|$)/);
  const branchingText = branchingMatch?.[0]?.trim() || '';
  
  // Extract TERMINAL NODES
  const terminalMatch = aiSummary.match(/🎯 TERMINAL NODES[\s\S]*?(?=📤|✅|═══|$)/);
  const terminalText = terminalMatch?.[0]?.trim() || '';
  
  // Extract DATA FLOW PATH
  const dataFlowMatch = aiSummary.match(/📤 COMPLETE DATA FLOW PATH:\s*([\s\S]*?)(?=✅|═══|$)/);
  const dataFlowText = dataFlowMatch?.[1]?.trim() || '';
  
  // Build comprehensive FLOW section combining execution steps, branching, and data flow
  const flowSection = [
    executionStepsText,
    branchingText ? `\n${branchingText}` : '',
    terminalText ? `\n${terminalText}` : '',
    dataFlowText ? `\n\nData Flow: ${dataFlowText}` : '',
  ].filter(Boolean).join('\n');
  
  // Build frontend-expected format
  const formatted = `WORKFLOW: ${objective}

TRIGGER
Workflow starts with the first node and processes data through all configured steps.

FLOW
${flowSection || 'Nodes will execute in sequence as configured'}

CONNECTIONS
All nodes are connected in execution order. Data flows from each node to the next.`;

  return formatted;
}
