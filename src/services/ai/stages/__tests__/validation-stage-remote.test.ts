jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

jest.mock('../validation-stage-client', () => ({
  runValidationStageRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn(() => ({ systemPrompt: 'VALIDATION_SYSTEM_PROMPT' })),
  },
  ValidationIssue: {},
}));

jest.mock('../../../../core/orchestration/unified-graph-orchestrator', () => ({
  unifiedGraphOrchestrator: {
    validateWorkflow: jest.fn(),
  },
}));

jest.mock('../../../../core/utils/node-field-intelligence', () => ({
  validateWorkflowNodeIntelligence: jest.fn(() => []),
}));

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedGraphOrchestrator } from '../../../../core/orchestration/unified-graph-orchestrator';
import { runValidationStage } from '../validation-stage';
import { runValidationStageRemote } from '../validation-stage-client';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockValidateWorkflow = unifiedGraphOrchestrator.validateWorkflow as jest.Mock;
const mockRunValidationStageRemote = runValidationStageRemote as jest.Mock;

const minimalWorkflow = {
  nodes: [
    { id: 'node_manual_trigger_1', type: 'manual_trigger', data: { label: 'Trigger', type: 'manual_trigger', category: 'trigger', config: {} } },
    { id: 'node_google_gmail_1', type: 'google_gmail', data: { label: 'Gmail', type: 'google_gmail', category: 'communication', config: {} } },
  ],
  edges: [{ id: 'edge_1', source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
};

const remoteSuccess = {
  ok: true as const,
  status: 'pass' as const,
  issues: [],
  durationMs: 18,
  llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 8, completionTokens: 12 },
};

describe('runValidationStage remote delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateWorkflow.mockReturnValue({ valid: true, errors: [] });
  });

  it('uses ai-generator result and skips local Gemini on remote success', async () => {
    mockRunValidationStageRemote.mockResolvedValue(remoteSuccess);

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send email when triggered',
      undefined,
      undefined,
      'remote-success',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validationIssues).toEqual([]);
    expect(result.llmCall.model).toBe('gemini-3.5-flash');
    expect(result.llmCall.promptTokens).toBe(8);
    expect(result.llmCall.completionTokens).toBe(12);

    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunValidationStageRemote).toHaveBeenCalledWith(
      minimalWorkflow,
      '[]',
      'Send email when triggered',
      undefined,
      undefined,
      'remote-success',
      undefined,
    );
  });

  it('always calls unifiedGraphOrchestrator.validateWorkflow as structural safety net on remote success', async () => {
    mockRunValidationStageRemote.mockResolvedValue(remoteSuccess);

    await runValidationStage(minimalWorkflow, '[]', 'intent', undefined, undefined, 'corr-1');

    expect(mockValidateWorkflow).toHaveBeenCalledWith(minimalWorkflow);
  });

  it('returns ok: false with ORCHESTRATOR_VALIDATION_FAILED when orchestrator rejects remote-validated workflow', async () => {
    mockRunValidationStageRemote.mockResolvedValue(remoteSuccess);
    mockValidateWorkflow.mockReturnValue({ valid: false, errors: ['Missing trigger node'] });

    const result = await runValidationStage(minimalWorkflow, '[]', 'intent', undefined, undefined, 'corr-orch');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ORCHESTRATOR_VALIDATION_FAILED');
    expect(result.validationIssues.some((i) => i.description.includes('Missing trigger node'))).toBe(true);
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('falls back to local Gemini when ai-generator returns null (AI_GENERATOR_URL unset)', async () => {
    mockRunValidationStageRemote.mockResolvedValue(null);
    const validPass = JSON.stringify({ status: 'pass', issues: [] });
    mockProcessRequest.mockResolvedValue(validPass);

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send email when triggered',
      undefined,
      undefined,
      'no-url',
    );

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'workflow-analysis',
      expect.objectContaining({
        system: 'VALIDATION_SYSTEM_PROMPT',
        message: expect.stringContaining('Send email when triggered'),
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });

  it('runs orchestrator safety net when remote returns INVALID_LLM_RESPONSE without calling local Gemini', async () => {
    mockRunValidationStageRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not json',
      durationMs: 5,
    });

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send email when triggered',
      undefined,
      undefined,
      'remote-invalid',
    );

    // Orchestrator safety net must have run
    expect(mockValidateWorkflow).toHaveBeenCalled();
    // Local Gemini must not be called
    expect(mockProcessRequest).not.toHaveBeenCalled();
    // Result is ok: true because orchestrator reports valid
    expect(result.ok).toBe(true);
  });
});
