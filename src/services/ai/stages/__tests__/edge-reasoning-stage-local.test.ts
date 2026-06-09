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

jest.mock('../edge-reasoning-stage-client', () => ({
  runEdgeReasoningJsonRemote: jest.fn(),
  runEdgeReasoningStageRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn((params: any) => ({
      systemPrompt: params.stageContext?.cycleInfo
        ? 'EDGE_REASONING_CYCLE_REPROMPT'
        : 'EDGE_REASONING_SYSTEM_PROMPT',
    })),
  },
}));

jest.mock('../../../../core/orchestration/unified-graph-orchestrator', () => ({
  unifiedGraphOrchestrator: {
    initializeWorkflow: jest.fn(),
  },
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getOutgoingPortsForWorkflowNode: jest.fn(() => ['output']),
  },
}));

jest.mock('../../../../core/utils/branching-node-ports', () => ({
  extractSwitchCasePortNames: jest.fn(() => []),
}));

import { unifiedGraphOrchestrator } from '../../../../core/orchestration/unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { systemPromptBuilder } from '../../system-prompt-builder';
import { runEdgeReasoningStage } from '../edge-reasoning-stage';
import { runEdgeReasoningJsonRemote, runEdgeReasoningStageRemote } from '../edge-reasoning-stage-client';
import type { SelectedNode } from '../../system-prompt-builder';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockBuildPrompt = systemPromptBuilder.build as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockInitializeWorkflow = unifiedGraphOrchestrator.initializeWorkflow as jest.Mock;
const mockRunEdgeReasoningJsonRemote = runEdgeReasoningJsonRemote as jest.Mock;
const mockRunEdgeReasoningStageRemote = runEdgeReasoningStageRemote as jest.Mock;

const selectedNodes: SelectedNode[] = [
  { type: 'manual_trigger', role: 'trigger', reason: 'Starts the workflow', nodeId: 'node_manual_trigger_1' },
  { type: 'google_gmail', role: 'terminal', reason: 'Send email', nodeId: 'node_google_gmail_1' },
];

const cyclicNodes: SelectedNode[] = [
  ...selectedNodes,
  { type: 'slack_message', role: 'action', reason: 'Notify Slack', nodeId: 'node_slack_message_1' },
];

const registryDefinitions: Record<string, any> = {
  manual_trigger: {
    type: 'manual_trigger',
    label: 'Manual Trigger',
    category: 'trigger',
    isBranching: false,
    defaultConfig: () => ({ triggerMode: 'manual' }),
  },
  google_gmail: {
    type: 'google_gmail',
    label: 'Gmail',
    category: 'communication',
    isBranching: false,
    defaultConfig: () => ({ to: '' }),
  },
  slack_message: {
    type: 'slack_message',
    label: 'Slack Message',
    category: 'communication',
    isBranching: false,
    defaultConfig: () => ({ channel: '' }),
  },
};

const acyclicEdges = [
  { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
];

function makeEdgeJson(orderedNodes: string[], edges: Array<{ source: string; target: string; type: string }>) {
  return JSON.stringify({ orderedNodes, edges });
}

function mockRegistryDefinitions() {
  mockRegistryGet.mockImplementation((type: string) => registryDefinitions[type]);
}

describe('runEdgeReasoningStage local Gemini behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
    mockRunEdgeReasoningStageRemote.mockResolvedValue(null);
    mockRunEdgeReasoningJsonRemote.mockResolvedValue(null);
    mockInitializeWorkflow.mockReturnValue({ workflow: { nodes: [], edges: [] } });
  });

  it('uses local Gemini when remotes are unavailable and parses fenced JSON', async () => {
    mockProcessRequest.mockResolvedValue([
      '```json',
      makeEdgeJson(['node_manual_trigger_1', 'node_google_gmail_1'], acyclicEdges),
      '```',
    ].join('\n'));

    const result = await runEdgeReasoningStage(
      selectedNodes,
      'CATALOG_TEXT',
      'Send a Gmail message when manually triggered',
      'local-fenced',
      'workflow blueprint',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful edge reasoning');
    expect(result.orderedNodeIds).toEqual(['node_manual_trigger_1', 'node_google_gmail_1']);
    expect(result.edges).toEqual(acyclicEdges);
    expect(result.workflow.nodes).toEqual([
      {
        id: 'node_manual_trigger_1',
        type: 'manual_trigger',
        data: {
          label: 'Manual Trigger',
          type: 'manual_trigger',
          category: 'trigger',
          config: { triggerMode: 'manual' },
        },
      },
      {
        id: 'node_google_gmail_1',
        type: 'google_gmail',
        data: {
          label: 'Gmail',
          type: 'google_gmail',
          category: 'communication',
          config: { to: '' },
        },
      },
    ]);
    expect(result.workflow.edges).toEqual([
      expect.objectContaining({
        source: 'node_manual_trigger_1',
        target: 'node_google_gmail_1',
        type: 'main',
        targetHandle: 'input',
      }),
    ]);
    expect(mockRunEdgeReasoningStageRemote).toHaveBeenCalledWith({
      selectedNodes,
      catalog: 'CATALOG_TEXT',
      userIntent: 'Send a Gmail message when manually triggered',
      correlationId: 'local-fenced',
      structuralPrompt: 'workflow blueprint',
    });
    expect(mockRunEdgeReasoningJsonRemote).toHaveBeenCalledWith({
      systemPrompt: 'EDGE_REASONING_SYSTEM_PROMPT',
      message: expect.stringContaining('WORKFLOW_BLUEPRINT:\nworkflow blueprint'),
      correlationId: 'local-fenced',
    });
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'workflow-generation',
      expect.objectContaining({
        system: 'EDGE_REASONING_SYSTEM_PROMPT',
        message: expect.stringContaining('SELECTED_NODES:'),
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
    expect(mockInitializeWorkflow).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'node_manual_trigger_1' }),
        expect.objectContaining({ id: 'node_google_gmail_1' }),
      ]),
      expect.objectContaining({
        nodeIds: ['node_manual_trigger_1', 'node_google_gmail_1'],
        metadata: expect.objectContaining({ branchingNodeIds: [] }),
      }),
    );
  });

  it('retries once with a JSON-only reminder after a malformed local response', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(makeEdgeJson(['node_manual_trigger_1', 'node_google_gmail_1'], acyclicEdges));

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'Send a Gmail message', 'local-retry');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected retry to recover edge reasoning');
    expect(result.edges).toEqual(acyclicEdges);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      2,
      'workflow-generation',
      expect.objectContaining({
        system: expect.stringContaining('CRITICAL: Return ONLY valid JSON'),
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });

  it('returns INVALID_LLM_RESPONSE when the local provider throws', async () => {
    mockProcessRequest.mockRejectedValue(new Error('local provider unavailable'));

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'Send a Gmail message', 'local-provider-failure');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failed edge reasoning');
    expect(result.code).toBe('INVALID_LLM_RESPONSE');
    expect(result.rawResponse).toContain('local provider unavailable');
    expect(mockInitializeWorkflow).not.toHaveBeenCalled();
  });

  it('reprompts once when local cycle detection finds a cycle and accepts the repaired graph', async () => {
    mockProcessRequest
      .mockResolvedValueOnce(makeEdgeJson(
        ['node_manual_trigger_1', 'node_google_gmail_1'],
        [
          { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
          { source: 'node_google_gmail_1', target: 'node_manual_trigger_1', type: 'main' },
        ],
      ))
      .mockResolvedValueOnce(makeEdgeJson(
        ['node_manual_trigger_1', 'node_google_gmail_1', 'node_slack_message_1'],
        [
          { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
          { source: 'node_google_gmail_1', target: 'node_slack_message_1', type: 'main' },
        ],
      ));

    const result = await runEdgeReasoningStage(cyclicNodes, '[]', 'Send Gmail then Slack', 'local-cycle-repair');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected cycle repair to succeed');
    expect(result.orderedNodeIds).toEqual([
      'node_manual_trigger_1',
      'node_google_gmail_1',
      'node_slack_message_1',
    ]);
    expect(result.edges).toEqual([
      { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
      { source: 'node_google_gmail_1', target: 'node_slack_message_1', type: 'main' },
    ]);
    expect(mockBuildPrompt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stage: 'edge_reasoning',
        stageContext: expect.objectContaining({
          selectedNodes: cyclicNodes,
          cycleInfo: expect.stringContaining('node_manual_trigger_1'),
        }),
      }),
    );
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      2,
      'workflow-generation',
      expect.objectContaining({ system: 'EDGE_REASONING_CYCLE_REPROMPT' }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });

  it('returns CYCLE_DETECTED when the cycle reprompt still produces a cyclic graph', async () => {
    const cyclicJson = makeEdgeJson(
      ['node_manual_trigger_1', 'node_google_gmail_1'],
      [
        { source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' },
        { source: 'node_google_gmail_1', target: 'node_manual_trigger_1', type: 'main' },
      ],
    );
    mockProcessRequest
      .mockResolvedValueOnce(cyclicJson)
      .mockResolvedValueOnce(cyclicJson);

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'Send a Gmail message', 'local-cycle-failure');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected cycle detection failure');
    expect(result.code).toBe('CYCLE_DETECTED');
    expect(result.rawResponse).toBe(cyclicJson);
    expect(mockInitializeWorkflow).not.toHaveBeenCalled();
  });
});
