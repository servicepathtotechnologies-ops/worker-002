/**
 * Pipeline Reasoning Coordinator
 *
 * Implements a Junior/Senior AI review pattern for workflow generation stages.
 * Junior AI (gemini-3.5-flash) executes each stage; Senior AI (gemini-3.1-pro-preview)
 * validates and optionally corrects the proposal before it is accepted.
 */

import { geminiOrchestrator } from './gemini-orchestrator';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import type { StructuredIntent } from './intent-structurer';
import type { WorkflowIntentPlan } from './summarize-layer';

export interface StageProposal<T> {
  stageName: string;
  proposal: T;
  rationale: string;
}

export interface ValidationResult<T> {
  approved: boolean;
  correctedValue?: T;
  rejectionReason?: string;
}

export interface PipelineFullContext {
  originalPrompt: string;
  structuredIntent: StructuredIntent;
  workflowIntentPlan?: WorkflowIntentPlan;
  registryKnowledgeSummary: string;
  priorStageOutputs: Record<string, unknown>;
}

export class PipelineContractError extends Error {
  constructor(public readonly code: string, public readonly details?: string[]) {
    super(`Pipeline contract error: ${code}${details ? ' — ' + details.join('; ') : ''}`);
    this.name = 'PipelineContractError';
  }
}

export class PipelineReasoningCoordinator {
  constructor(
    private readonly seniorModel: string,
    private readonly juniorModel: string,
    private readonly fullContext: PipelineFullContext
  ) {}

  async executeStage<T>(
    stageName: string,
    juniorExecutor: () => Promise<StageProposal<T>>,
    seniorValidator: (proposal: StageProposal<T>, context: PipelineFullContext) => Promise<ValidationResult<T>>
  ): Promise<T> {
    // Junior executes
    const proposal = await juniorExecutor();

    // Senior validates
    const validation = await seniorValidator(proposal, this.fullContext);

    if (validation.approved) {
      return proposal.proposal;
    }

    // Rejected — incorporate correction and re-submit once
    if (validation.correctedValue !== undefined) {
      const correctedProposal: StageProposal<T> = {
        stageName,
        proposal: validation.correctedValue,
        rationale: `Corrected by Senior AI: ${validation.rejectionReason || 'see correction'}`,
      };
      const revalidation = await seniorValidator(correctedProposal, this.fullContext);
      if (revalidation.approved) {
        return correctedProposal.proposal;
      }
    }

    throw new PipelineContractError('SENIOR_REJECTION_LIMIT', [
      validation.rejectionReason || 'Senior AI rejected proposal twice',
    ]);
  }

  /**
   * Build a compact registry knowledge summary for Senior AI context.
   * Purely registry-driven — no hardcoded content.
   */
  static buildRegistryKnowledgeSummary(): string {
    const types = unifiedNodeRegistry.getAllTypes();
    const lines: string[] = ['Available node types:'];
    for (const type of types.slice(0, 80)) { // cap to avoid token overflow
      const def = unifiedNodeRegistry.get(type);
      if (!def) continue;
      const tags = def.tags?.join(', ') || '';
      lines.push(`- ${type} (${def.category || 'action'}${tags ? ', tags: ' + tags : ''}): ${def.description?.slice(0, 80) || ''}`);
    }
    return lines.join('\n');
  }
}
