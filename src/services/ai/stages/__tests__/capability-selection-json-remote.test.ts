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

jest.mock('../capability-stage-client', () => ({
  runCapabilitySelectionJsonRemote: jest.fn(),
}));

jest.mock('../../node-catalog-builder', () => ({
  buildNodeCatalogText: jest.fn(() => '[]'),
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn(() => ({ systemPrompt: 'CAPABILITY_SYSTEM_PROMPT' })),
  },
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    resolveAlias: jest.fn((type: string) => type),
    get: jest.fn(),
    getAllTypes: jest.fn(() => ['manual_trigger', 'google_gmail']),
    isTrigger: jest.fn((type: string) => type === 'manual_trigger'),
    getCategory: jest.fn((type: string) => (type === 'manual_trigger' ? 'trigger' : 'communication')),
  },
}));

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { runCapabilitySelectionStage } from '../capability-selection-stage';
import { runCapabilitySelectionJsonRemote } from '../capability-stage-client';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRunCapabilitySelectionJsonRemote = runCapabilitySelectionJsonRemote as jest.Mock;

const intent = {
  intent: 'Fetch a row and send it via Gmail',
  triggerType: 'manual_trigger' as const,
  actions: ['fetch a row', 'send it via Gmail'],
  dataFlows: [],
  constraints: [],
  originalPrompt: 'Fetch a row and send it via Gmail',
};

const remoteSteps = [
  {
    stepId: 'trigger',
    stepText: 'manual trigger',
    intentClass: 'trigger',
    candidateNodeTypes: ['manual_trigger'],
    defaultSuggestedNodeType: 'manual_trigger',
    selectionPolicy: { multiSelectAllowed: false, required: true },
  },
  {
    stepId: 'action_1',
    stepText: 'send it via Gmail',
    intentClass: 'communication',
    candidateNodeTypes: ['google_gmail'],
    defaultSuggestedNodeType: 'google_gmail',
    selectionPolicy: { multiSelectAllowed: false, required: true },
  },
];

describe('runCapabilitySelectionStage remote JSON delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryGet.mockImplementation((type: string) => {
      if (type === 'manual_trigger') {
        return {
          type,
          label: 'Manual Trigger',
          category: 'trigger',
          description: 'Starts a workflow manually',
        };
      }
      if (type === 'google_gmail') {
        return {
          type,
          label: 'Gmail',
          category: 'communication',
          description: 'Send email using Gmail',
          tags: ['gmail', 'email'],
          capabilities: ['send_email'],
        };
      }
      return undefined;
    });
  });

  it('uses ai-generator parsed steps while keeping local registry reconciliation', async () => {
    mockRunCapabilitySelectionJsonRemote.mockResolvedValue({
      ok: true,
      steps: remoteSteps,
      durationMs: 11,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 1, completionTokens: 1 },
    });

    const result = await runCapabilitySelectionStage(intent, 'remote-success');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.steps.map((step) => step.defaultSuggestedNodeType)).toEqual([
        'manual_trigger',
        'google_gmail',
      ]);
      expect(result.steps.every((step) => step.ambiguous === false)).toBe(true);
    }
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunCapabilitySelectionJsonRemote).toHaveBeenCalledWith({
      systemPrompt: 'CAPABILITY_SYSTEM_PROMPT',
      message: expect.stringContaining('STRUCTURED_INTENT:'),
      correlationId: 'remote-success',
    });
  });

  it('falls back to local Gemini when ai-generator returns invalid JSON', async () => {
    mockRunCapabilitySelectionJsonRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not json',
      durationMs: 5,
    });
    mockProcessRequest.mockResolvedValue(JSON.stringify({ steps: remoteSteps }));

    const result = await runCapabilitySelectionStage(intent, 'remote-invalid');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'node-suggestion',
      expect.objectContaining({
        system: 'CAPABILITY_SYSTEM_PROMPT',
        message: expect.stringContaining('STRUCTURED_INTENT:'),
      }),
      expect.objectContaining({
        model: 'gemini-3.5-flash',
        temperature: 0.1,
        cache: false,
      }),
    );
  });
});
