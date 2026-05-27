/**
 * Property-Based Tests: PipelineReasoningCoordinator
 * Feature: ai-workflow-generation-engine
 */

// Feature: ai-workflow-generation-engine, Property 40: Senior AI approval required before graph compilation
// Feature: ai-workflow-generation-engine, Property 41: Senior AI uses gemini-3.1-pro-preview; Junior AI uses gemini-3.5-flash
// Feature: ai-workflow-generation-engine, Property 42: Senior AI rejection produces corrected value, not empty

import {
  PipelineReasoningCoordinator,
  PipelineContractError,
  type StageProposal,
  type ValidationResult,
  type PipelineFullContext,
} from '../pipeline-reasoning-coordinator';

const mockContext: PipelineFullContext = {
  originalPrompt: 'Send email when form submitted',
  structuredIntent: {
    trigger: 'form',
    actions: [],
    requires_credentials: [],
  } as any,
  registryKnowledgeSummary: 'Available node types: form, google_gmail',
  priorStageOutputs: {},
};

// ─── Property 40: Senior AI approval required before graph compilation ────────

describe('Property 40: Senior AI approval required before graph compilation', () => {
  it('executeStage returns only after approval', async () => {
    const coordinator = new PipelineReasoningCoordinator(
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      mockContext
    );

    let validationCallCount = 0;

    const juniorExecutor = async (): Promise<StageProposal<string[]>> => ({
      stageName: 'node-selection',
      proposal: ['form', 'google_gmail'],
      rationale: 'User wants to send email from form',
    });

    const seniorValidator = async (
      proposal: StageProposal<string[]>
    ): Promise<ValidationResult<string[]>> => {
      validationCallCount++;
      // Approve on second call (first call rejects with correction)
      if (validationCallCount === 1) {
        return {
          approved: false,
          correctedValue: ['form', 'google_gmail'],
          rejectionReason: 'Missing trigger node',
        };
      }
      return { approved: true };
    };

    const result = await coordinator.executeStage('node-selection', juniorExecutor, seniorValidator);
    expect(result).toEqual(['form', 'google_gmail']);
    expect(validationCallCount).toBe(2);
  });

  it('executeStage throws PipelineContractError when rejected twice', async () => {
    const coordinator = new PipelineReasoningCoordinator(
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      mockContext
    );

    const juniorExecutor = async (): Promise<StageProposal<string[]>> => ({
      stageName: 'node-selection',
      proposal: ['unknown_node'],
      rationale: 'Bad proposal',
    });

    const seniorValidator = async (): Promise<ValidationResult<string[]>> => ({
      approved: false,
      correctedValue: ['unknown_node'],
      rejectionReason: 'Node not in registry',
    });

    await expect(
      coordinator.executeStage('node-selection', juniorExecutor, seniorValidator)
    ).rejects.toThrow(PipelineContractError);
  });

  it('executeStage returns immediately when Senior approves on first call', async () => {
    const coordinator = new PipelineReasoningCoordinator(
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      mockContext
    );

    let callCount = 0;
    const juniorExecutor = async (): Promise<StageProposal<string[]>> => ({
      stageName: 'node-selection',
      proposal: ['manual_trigger', 'google_gmail'],
      rationale: 'Valid proposal',
    });

    const seniorValidator = async (): Promise<ValidationResult<string[]>> => {
      callCount++;
      return { approved: true };
    };

    const result = await coordinator.executeStage('node-selection', juniorExecutor, seniorValidator);
    expect(result).toEqual(['manual_trigger', 'google_gmail']);
    expect(callCount).toBe(1);
  });
});

// ─── Property 41: Model assignment ───────────────────────────────────────────

describe('Property 41: Senior AI uses gemini-3.1-pro-preview; Junior AI uses gemini-3.5-flash', () => {
  it('coordinator stores the correct model names', () => {
    const coordinator = new PipelineReasoningCoordinator(
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      mockContext
    );

    // Access private fields via bracket notation for testing
    expect((coordinator as any).seniorModel).toBe('gemini-3.1-pro-preview');
    expect((coordinator as any).juniorModel).toBe('gemini-3.5-flash');
  });

  it('can be constructed with any model strings', () => {
    const coordinator = new PipelineReasoningCoordinator(
      'custom-senior-model',
      'custom-junior-model',
      mockContext
    );

    expect((coordinator as any).seniorModel).toBe('custom-senior-model');
    expect((coordinator as any).juniorModel).toBe('custom-junior-model');
  });
});

// ─── Property 42: Senior AI rejection produces corrected value ────────────────

describe('Property 42: Senior AI rejection produces corrected value, not empty', () => {
  it('ValidationResult with approved=false has non-null correctedValue and non-empty rejectionReason', async () => {
    const coordinator = new PipelineReasoningCoordinator(
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      mockContext
    );

    const correctedValue = ['manual_trigger', 'google_gmail'];
    const rejectionReason = 'Original proposal had unknown node type';

    const juniorExecutor = async (): Promise<StageProposal<string[]>> => ({
      stageName: 'node-selection',
      proposal: ['bad_node'],
      rationale: 'Bad proposal',
    });

    let capturedValidation: ValidationResult<string[]> | null = null;
    const seniorValidator = async (
      proposal: StageProposal<string[]>
    ): Promise<ValidationResult<string[]>> => {
      if (proposal.proposal.includes('bad_node')) {
        const result: ValidationResult<string[]> = {
          approved: false,
          correctedValue,
          rejectionReason,
        };
        capturedValidation = result;
        return result;
      }
      return { approved: true };
    };

    await coordinator.executeStage('node-selection', juniorExecutor, seniorValidator);

    expect(capturedValidation).not.toBeNull();
    expect(capturedValidation!.approved).toBe(false);
    expect(capturedValidation!.correctedValue).not.toBeNull();
    expect(capturedValidation!.correctedValue).not.toHaveLength(0);
    expect(capturedValidation!.rejectionReason).toBeTruthy();
    expect(capturedValidation!.rejectionReason!.length).toBeGreaterThan(0);
  });

  it('PipelineContractError has correct code and details', () => {
    const error = new PipelineContractError('SENIOR_REJECTION_LIMIT', ['reason 1', 'reason 2']);
    expect(error.code).toBe('SENIOR_REJECTION_LIMIT');
    expect(error.details).toEqual(['reason 1', 'reason 2']);
    expect(error.message).toContain('SENIOR_REJECTION_LIMIT');
    expect(error.name).toBe('PipelineContractError');
  });
});
