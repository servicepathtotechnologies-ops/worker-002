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
    build: jest.fn(() => ({ systemPrompt: 'EDGE_REASONING_SYSTEM_PROMPT' })),
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

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { unifiedGraphOrchestrator } from '../../../../core/orchestration/unified-graph-orchestrator';
import { runEdgeReasoningStage } from '../edge-reasoning-stage';
import { runEdgeReasoningJsonRemote, runEdgeReasoningStageRemote } from '../edge-reasoning-stage-client';
import type { SelectedNode } from '../../system-prompt-builder';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockInitializeWorkflow = unifiedGraphOrchestrator.initializeWorkflow as jest.Mock;
const mockRunEdgeReasoningJsonRemote = runEdgeReasoningJsonRemote as jest.Mock;
const mockRunEdgeReasoningStageRemote = runEdgeReasoningStageRemote as jest.Mock;

const selectedNodes: SelectedNode[] = [
  { type: 'manual_trigger', role: 'trigger', reason: 'Starts the workflow', nodeId: 'node_manual_trigger_1' },
  { type: 'google_gmail', role: 'terminal', reason: 'Send email', nodeId: 'node_google_gmail_1' },
];

const stageRemoteSuccess = {
  ok: true as const,
  orderedNodeIds: ['node_manual_trigger_1', 'node_google_gmail_1'],
  edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
  workflow: { nodes: [], edges: [] },
  durationMs: 22,
  llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 7, completionTokens: 14 },
};

function mockRegistryDefinitions() {
  mockRegistryGet.mockImplementation((type: string) => {
    if (type === 'manual_trigger') {
      return { type, label: 'Manual Trigger', category: 'trigger', isBranching: false, defaultConfig: () => ({}) };
    }
    if (type === 'google_gmail') {
      return { type, label: 'Gmail', category: 'communication', isBranching: false, defaultConfig: () => ({}) };
    }
    return undefined;
  });
}

function mockOrchestratorInit(nodes: unknown[], edges: unknown[]) {
  mockInitializeWorkflow.mockReturnValue({ workflow: { nodes, edges } });
}

describe('runEdgeReasoningStage full-stage remote delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
  });

  it('uses ai-generator stage result and skips JSON remote and local Gemini on stage remote success', async () => {
    mockRunEdgeReasoningStageRemote.mockResolvedValue(stageRemoteSuccess);
    mockOrchestratorInit(
      selectedNodes.map((n) => ({ id: n.nodeId, type: n.type, data: { type: n.type, label: n.type, category: 'action', config: {} } })),
      [],
    );

    const result = await runEdgeReasoningStage(
      selectedNodes,
      '[]',
      'Send email when triggered',
      'stage-remote-success',
      'blueprint',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderedNodeIds).toEqual(stageRemoteSuccess.orderedNodeIds);
    expect(result.edges).toEqual(stageRemoteSuccess.edges);
    expect(result.llmCall.promptTokens).toBe(7);
    expect(result.llmCall.completionTokens).toBe(14);

    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunEdgeReasoningJsonRemote).not.toHaveBeenCalled();
    expect(mockRunEdgeReasoningStageRemote).toHaveBeenCalledWith({
      selectedNodes,
      catalog: '[]',
      userIntent: 'Send email when triggered',
      correlationId: 'stage-remote-success',
      structuralPrompt: 'blueprint',
    });
  });

  it('falls back to JSON remote then local Gemini when stage remote returns null', async () => {
    mockRunEdgeReasoningStageRemote.mockResolvedValue(null);
    mockRunEdgeReasoningJsonRemote.mockResolvedValue(null);

    const localResponse = {
      orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
      edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
    };
    mockProcessRequest.mockResolvedValue(JSON.stringify(localResponse));
    mockOrchestratorInit(
      selectedNodes.map((n) => ({ id: n.nodeId, type: n.type, data: { type: n.type, label: n.type, category: 'action', config: {} } })),
      [],
    );

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'intent', 'no-url');

    expect(result.ok).toBe(true);
    expect(mockRunEdgeReasoningJsonRemote).toHaveBeenCalled();
    expect(mockProcessRequest).toHaveBeenCalled();
  });

  it('falls back to JSON remote then local Gemini when stage remote returns INVALID_LLM_RESPONSE', async () => {
    mockRunEdgeReasoningStageRemote.mockResolvedValue({
      ok: false as const,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not json',
      durationMs: 5,
    });
    mockRunEdgeReasoningJsonRemote.mockResolvedValue(null);

    const localResponse = {
      orderedNodes: ['node_manual_trigger_1', 'node_google_gmail_1'],
      edges: [{ source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
    };
    mockProcessRequest.mockResolvedValue(JSON.stringify(localResponse));
    mockOrchestratorInit(
      selectedNodes.map((n) => ({ id: n.nodeId, type: n.type, data: { type: n.type, label: n.type, category: 'action', config: {} } })),
      [],
    );

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'intent', 'stage-invalid');

    expect(result.ok).toBe(true);
    expect(mockRunEdgeReasoningJsonRemote).toHaveBeenCalled();
    expect(mockProcessRequest).toHaveBeenCalled();
  });

  it('propagates CYCLE_DETECTED from stage remote without calling JSON remote or local Gemini', async () => {
    mockRunEdgeReasoningStageRemote.mockResolvedValue({
      ok: false as const,
      code: 'CYCLE_DETECTED' as const,
      rawResponse: 'cyclic graph json',
      durationMs: 10,
    });

    const result = await runEdgeReasoningStage(selectedNodes, '[]', 'intent', 'stage-cycle');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CYCLE_DETECTED');
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunEdgeReasoningJsonRemote).not.toHaveBeenCalled();
  });
});
