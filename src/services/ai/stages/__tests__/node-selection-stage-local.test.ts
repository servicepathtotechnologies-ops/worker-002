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
    resolveAlias: jest.fn((type: string) => type),
    get: jest.fn(),
    isTrigger: jest.fn(),
    getCategory: jest.fn(),
  },
}));

jest.mock('../../pipeline-observability', () => ({
  incrementPipelineCounter: jest.fn(),
}));

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { incrementPipelineCounter } from '../../pipeline-observability';
import { systemPromptBuilder } from '../../system-prompt-builder';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { runNodeSelectionStage } from '../node-selection-stage';
import { runNodeSelectionJsonRemote } from '../node-selection-stage-client';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRunNodeSelectionJsonRemote = runNodeSelectionJsonRemote as jest.Mock;
const mockBuildPrompt = systemPromptBuilder.build as jest.Mock;
const mockIncrementPipelineCounter = incrementPipelineCounter as jest.Mock;
const mockRegistryResolveAlias = unifiedNodeRegistry.resolveAlias as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRegistryIsTrigger = unifiedNodeRegistry.isTrigger as jest.Mock;
const mockRegistryGetCategory = unifiedNodeRegistry.getCategory as jest.Mock;

const intent = {
  intent: 'Send a Gmail message when manually triggered',
  triggerType: 'manual_trigger' as const,
  actions: ['send a Gmail message'],
  dataFlows: [],
  constraints: [],
  originalPrompt: 'Send a Gmail message when manually triggered',
};

const registryDefinitions: Record<string, any> = {
  manual_trigger: {
    type: 'manual_trigger',
    label: 'Manual Trigger',
    category: 'trigger',
  },
  google_gmail: {
    type: 'google_gmail',
    label: 'Gmail',
    category: 'communication',
    workflowBehavior: { alwaysTerminal: true },
  },
  slack_message: {
    type: 'slack_message',
    label: 'Slack Message',
    category: 'communication',
    workflowBehavior: { alwaysTerminal: true },
  },
  switch: {
    type: 'switch',
    label: 'Switch',
    category: 'logic',
    isBranching: true,
  },
  http_request: {
    type: 'http_request',
    label: 'HTTP Request',
    category: 'integration',
  },
};

function mockRegistryDefinitions() {
  mockRegistryResolveAlias.mockImplementation((type: string) => {
    if (type === 'gmail_alias') return 'google_gmail';
    if (type === 'manual') return 'manual_trigger';
    return type;
  });
  mockRegistryGet.mockImplementation((type: string) => registryDefinitions[type]);
  mockRegistryIsTrigger.mockImplementation((type: string) => type === 'manual_trigger');
  mockRegistryGetCategory.mockImplementation((type: string) => registryDefinitions[type]?.category);
}

function makeSelectionJson(selectedNodes: Array<{ type: string; role: string; reason: string }>) {
  return JSON.stringify({ selectedNodes });
}

describe('runNodeSelectionStage local Gemini behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
    mockRunNodeSelectionJsonRemote.mockResolvedValue(null);
  });

  it('uses local Gemini when remote is unavailable and parses fenced JSON', async () => {
    const constraints = {
      selectedNodeConstraintsByStep: {
        '1': ['manual_trigger'],
        '2': ['gmail_alias'],
      },
      selectedNodeConstraintsFlat: ['manual_trigger', 'google_gmail'],
    };
    mockProcessRequest.mockResolvedValue([
      '```json',
      makeSelectionJson([
        { type: 'manual_trigger', role: 'trigger', reason: 'Start manually' },
        { type: 'gmail_alias', role: 'action', reason: 'Send the Gmail message' },
      ]),
      '```',
    ].join('\n'));

    const result = await runNodeSelectionStage(intent, 'CATALOG_TEXT', 'local-fenced', 'workflow blueprint', constraints);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful node selection');
    expect(result.selectedNodes).toEqual([
      {
        type: 'manual_trigger',
        role: 'trigger',
        reason: 'Start manually',
        nodeId: 'node_manual_trigger_1',
      },
      {
        type: 'google_gmail',
        role: 'terminal',
        reason: 'Send the Gmail message',
        nodeId: 'node_google_gmail_1',
      },
    ]);
    expect(mockRunNodeSelectionJsonRemote).toHaveBeenCalledWith({
      systemPrompt: 'NODE_SELECTION_SYSTEM_PROMPT',
      message: expect.stringContaining('WORKFLOW_BLUEPRINT:\nworkflow blueprint'),
      correlationId: 'local-fenced',
    });
    expect(mockBuildPrompt).toHaveBeenCalledWith({
      stage: 'node_selection',
      nodeCatalog: 'CATALOG_TEXT',
      userIntent: intent.intent,
      stageContext: constraints,
    });
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
        structuredOutput: expect.objectContaining({
          mimeType: 'application/json',
          schema: expect.objectContaining({ type: 'object' }),
        }),
      }),
    );
  });

  it('filters unknown and disallowed local nodes while injecting a missing trigger', async () => {
    mockProcessRequest.mockResolvedValue(makeSelectionJson([
      { type: 'gmail_alias', role: 'action', reason: 'Send the Gmail message' },
      { type: 'slack_message', role: 'action', reason: 'Disallowed by capability selection' },
      { type: 'made_up_node', role: 'action', reason: 'Unknown node type' },
    ]));

    const result = await runNodeSelectionStage(
      intent,
      '[]',
      'local-reconcile',
      undefined,
      { selectedNodeConstraintsFlat: ['manual_trigger', 'google_gmail'] },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful node selection');
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
        reason: 'Send the Gmail message',
        nodeId: 'node_google_gmail_1',
      },
    ]);
  });

  it('retries once with a schema reminder after an invalid local response', async () => {
    const retryJson = makeSelectionJson([
      { type: 'manual_trigger', role: 'trigger', reason: 'Start manually' },
      { type: 'http_request', role: 'action', reason: 'Call the external API' },
    ]);
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(retryJson);

    const result = await runNodeSelectionStage(intent, '[]', 'local-retry');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful retry result');
    expect(result.selectedNodes.map((node) => node.type)).toEqual(['manual_trigger', 'http_request']);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      2,
      'node-suggestion',
      expect.objectContaining({
        system: expect.stringContaining('CRITICAL: Return ONLY valid JSON'),
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
    expect(mockIncrementPipelineCounter).toHaveBeenCalledWith('node_selection_structured_decode_fail');
  });

  it('recovers deterministically from intent and required node types after invalid retry output', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('still-not-json');

    const result = await runNodeSelectionStage(
      intent,
      '[]',
      'local-deterministic-recovery',
      undefined,
      { requiredNodeTypes: ['gmail_alias', 'http_request'] },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected deterministic recovery result');
    expect(result.selectedNodes).toEqual([
      {
        type: 'manual_trigger',
        role: 'trigger',
        reason: 'Recovered trigger from structured intent',
        nodeId: 'node_manual_trigger_1',
      },
      {
        type: 'google_gmail',
        role: 'terminal',
        reason: 'Recovered from user-confirmed capability selection',
        nodeId: 'node_google_gmail_1',
      },
      {
        type: 'http_request',
        role: 'action',
        reason: 'Recovered from user-confirmed capability selection',
        nodeId: 'node_http_request_1',
      },
    ]);
    expect(mockIncrementPipelineCounter).toHaveBeenCalledWith('node_selection_structured_decode_fail');
    expect(mockIncrementPipelineCounter).toHaveBeenCalledWith('node_selection_deterministic_recovery_used');
  });

  it('returns INVALID_LLM_RESPONSE when the first local Gemini call throws', async () => {
    mockProcessRequest.mockRejectedValue(new Error('local provider unavailable'));

    const result = await runNodeSelectionStage(intent, '[]', 'local-throws');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'Error: local provider unavailable',
      durationMs: expect.any(Number),
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });
});
