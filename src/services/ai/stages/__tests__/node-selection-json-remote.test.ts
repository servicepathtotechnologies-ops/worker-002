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

jest.mock('../node-selection-stage-client', () => ({
  runNodeSelectionJsonRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  NODE_SELECTION_OUTPUT_SCHEMA: {
    type: 'object',
    properties: { selectedNodes: { type: 'array' } },
  },
  systemPromptBuilder: {
    build: jest.fn(() => ({ systemPrompt: 'NODE_SELECTION_SYSTEM_PROMPT' })),
  },
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    resolveAlias: jest.fn((type: string) => (type === 'gmail_alias' ? 'google_gmail' : type)),
    get: jest.fn(),
    isTrigger: jest.fn((type: string) => type === 'manual_trigger'),
    getCategory: jest.fn((type: string) => {
      if (type === 'manual_trigger') return 'trigger';
      if (type === 'if_else') return 'logic';
      return 'communication';
    }),
  },
}));

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { runNodeSelectionStage } from '../node-selection-stage';
import { runNodeSelectionJsonRemote } from '../node-selection-stage-client';
import type { StructuredIntent } from '../intent-stage';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRunNodeSelectionJsonRemote = runNodeSelectionJsonRemote as jest.Mock;

const intent: StructuredIntent = {
  intent: 'Send a Gmail message when manually triggered',
  triggerType: 'manual_trigger',
  actions: ['send a Gmail message'],
  dataFlows: [],
  constraints: [],
  originalPrompt: 'Send a Gmail message when manually triggered',
};

function mockRegistryDefinitions() {
  mockRegistryGet.mockImplementation((type: string) => {
    if (type === 'manual_trigger') {
      return {
        type,
        label: 'Manual Trigger',
        category: 'trigger',
      };
    }
    if (type === 'google_gmail') {
      return {
        type,
        label: 'Gmail',
        category: 'communication',
        workflowBehavior: { alwaysTerminal: true },
      };
    }
    if (type === 'slack_message') {
      return {
        type,
        label: 'Slack',
        category: 'communication',
        workflowBehavior: { alwaysTerminal: true },
      };
    }
    return undefined;
  });
}

describe('runNodeSelectionStage remote JSON delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
  });

  it('uses ai-generator parsed nodes while keeping local registry reconciliation', async () => {
    mockRunNodeSelectionJsonRemote.mockResolvedValue({
      ok: true,
      selectedNodes: [
        { type: 'gmail_alias', role: 'terminal', reason: 'User requested Gmail' },
        { type: 'slack_message', role: 'terminal', reason: 'Remote included a disallowed node' },
      ],
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 1, completionTokens: 1 },
    });

    const result = await runNodeSelectionStage(
      intent,
      '[]',
      'remote-success',
      'blueprint',
      {
        selectedNodeConstraintsFlat: ['manual_trigger', 'google_gmail'],
        requiredNodeTypes: ['manual_trigger', 'google_gmail'],
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedNodes).toEqual([
        {
          type: 'manual_trigger',
          role: 'trigger',
          reason: 'Required trigger selected from registry',
          nodeId: 'node_manual_trigger_1',
        },
        {
          type: 'google_gmail',
          role: 'terminal',
          reason: 'User requested Gmail',
          nodeId: 'node_google_gmail_1',
        },
      ]);
      expect(result.llmCall.promptTokens).toBe(1);
    }

    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunNodeSelectionJsonRemote).toHaveBeenCalledWith({
      systemPrompt: 'NODE_SELECTION_SYSTEM_PROMPT',
      message: expect.stringContaining('STRUCTURED_INTENT:'),
      correlationId: 'remote-success',
    });
  });

  it('falls back to local Gemini when ai-generator returns invalid JSON', async () => {
    mockRunNodeSelectionJsonRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not json',
      durationMs: 9,
    });
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({
        selectedNodes: [
          { type: 'manual_trigger', role: 'trigger', reason: 'Manual trigger' },
          { type: 'google_gmail', role: 'terminal', reason: 'Send Gmail' },
        ],
      }),
    );

    const result = await runNodeSelectionStage(intent, '[]', 'remote-invalid');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'node-suggestion',
      expect.objectContaining({
        system: 'NODE_SELECTION_SYSTEM_PROMPT',
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
